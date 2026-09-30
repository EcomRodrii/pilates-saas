// Guardar un lead del formulario de migración «concierge», sin Supabase para que
// se pueda probar sola (`npm test`). La usa app/api/public/migracion-concierge.
//
// Por qué no es un `upsert` sobre el email, que es lo que había:
//
//   · Un `upsert` con la fila entera, al chocar con el email, reescribía TODAS
//     las columnas que llevaba: el `id` del lead y su `origen`. El comentario de
//     la ruta prometía refrescar solo el software y la fecha, y no era cierto.
//   · Cambiar el `id` de un lead existente choca con las tablas que lo
//     referencian (`plataforma_prospeccion_email`, `plataforma_lead_consentimiento`:
//     `references plataforma_lead(id)` sin `on update cascade`). Es decir: volver a
//     enviar el formulario con un email que ya tenía historial daba un error de
//     clave foránea y ese lead ni se refrescaba.
//   · Y pisaba el `origen`: un lead que llegó por una descarga pasaba a figurar
//     como «CONCIERGE», y la atribución se perdía.
//
// Aquí se INSERTA, y solo si el email ya existe se refresca lo único que debe
// cambiar. `estado` y `notas` tampoco se tocan: alguien pudo haberlo trabajado ya.

export interface ErrorDb { code?: string; message?: string }

export interface FilaLead {
  id: string;
  email: string;
  software_actual: string | null;
  origen: 'CONCIERGE';
  actualizado_en: string;
}

export interface CambiosLead {
  software_actual: string | null;
  actualizado_en: string;
}

export interface EntradaLead {
  id: string;
  email: string;
  software: string;
  ahora: string;
}

export interface SalidaLeads {
  insertar(fila: FilaLead): Promise<ErrorDb | null>;
  refrescar(email: string, cambios: CambiosLead): Promise<ErrorDb | null>;
}

export type ResultadoGuardarLead = { ok: true } | { ok: false; error: ErrorDb };

/** Código de Postgres para «ya existe esa clave única» (aquí, el email). */
const VIOLACION_UNICA = '23505';

export async function guardarLeadConcierge(
  entrada: EntradaLead,
  salida: SalidaLeads,
): Promise<ResultadoGuardarLead> {
  const software = entrada.software || null;

  const errorInsertar = await salida.insertar({
    id: entrada.id,
    email: entrada.email,
    software_actual: software,
    origen: 'CONCIERGE',
    actualizado_en: entrada.ahora,
  });
  if (!errorInsertar) return { ok: true };
  if (errorInsertar.code !== VIOLACION_UNICA) return { ok: false, error: errorInsertar };

  // Ya estaba: la misma persona recargó el formulario o volvió. Solo se refresca
  // lo que ha cambiado de verdad.
  const errorRefrescar = await salida.refrescar(entrada.email, {
    software_actual: software,
    actualizado_en: entrada.ahora,
  });
  return errorRefrescar ? { ok: false, error: errorRefrescar } : { ok: true };
}
