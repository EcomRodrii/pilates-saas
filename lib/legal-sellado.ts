import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { textoLegalVigenteDeFila } from '@/lib/legal-textos';
import { hashTextoLegal } from '@/lib/legal-hash';

// Sella qué condiciones estaban vigentes cuando una clienta compra.
//
// ── Por qué en servidor y no en el cliente ───────────────────────────────────
// El hash lo calcula QUIEN CREA EL PAGO, a partir de los textos del estudio en
// ese instante. Si lo mandara el navegador, la prueba de qué se aceptó vendría
// de la parte que tiene interés en discutirla — y bastaría con editar una
// petición para «aceptar» otras condiciones distintas de las que se enseñaron.
//
// ── Best-effort, a propósito ─────────────────────────────────────────────────
// Si esto falla, la compra SIGUE. Un fallo registrando la versión de unas
// condiciones no puede impedir que alguien pague lo que ha decidido pagar; se
// queda sin sello (`NULL`, que la columna admite y significa exactamente eso)
// en vez de tumbar el cobro. Mismo criterio que `emitirPagoRealizado`.

export interface SelloLegal {
  hash: string;
  aceptadoEn: string;
}

/**
 * El texto legal vigente del estudio (privacidad + términos), compuesto EN
 * SERVIDOR con sus datos de la base. `null` si no se pudo leer el estudio.
 *
 * Lo comparten el sello por compra y la aceptación del contrato de la socia
 * (`/api/public/socio`, `/api/socios/[id]/aceptacion-contrato`): el mismo texto,
 * la misma huella, y ninguno de los dos se fía del que manda el navegador.
 */
export async function componerTextoLegalVigente(
  admin: SupabaseClient,
  studioId: string,
): Promise<string | null> {
  const { data: s, error } = await admin
    .from('studios')
    .select('nombre, razon_social, nif, direccion, ciudad, codigo_postal, email, politica_privacidad, terminos_servicio, cancelacion_ventana_horas, penalizacion_importe_eur')
    .eq('id', studioId)
    .maybeSingle();
  if (error || !s) return null;

  // La MISMA composición que ve la alumna en el portal, `/reservar` y el widget
  // (`studioPublico` usa `configLegalDeFila`, y esto `textoLegalVigenteDeFila`,
  // que la envuelve): sus textos si los ha reescrito, y si no los de por defecto
  // redactados con sus datos fiscales, su ventana de cancelación y, si tiene
  // importe, la cláusula de penalización.
  //
  // ⚠️ El mapeo a camelCase es OBLIGATORIO y no cosmético: `DatosEstudioLegal`
  // tiene todos los campos opcionales, así que pasarle la fila cruda en
  // snake_case COMPILA y se traga en silencio `razon_social`, `codigo_postal`,
  // `cancelacion_ventana_horas` y `penalizacion_importe_eur`. Por eso no se
  // compone aquí a mano: un solo dueño, en `lib/legal-textos.ts`.
  return textoLegalVigenteDeFila(s as Record<string, unknown>);
}

/**
 * Compone el texto legal vigente del estudio, lo guarda UNA vez por versión, y
 * devuelve su huella. `null` si no se pudo (y entonces la compra va sin sello).
 */
export async function sellarCondicionesVigentes(
  admin: SupabaseClient,
  studioId: string,
): Promise<SelloLegal | null> {
  try {
    const texto = await componerTextoLegalVigente(admin, studioId);
    if (!texto) return null;
    const hash = hashTextoLegal(texto);

    // Una fila por texto y estudio. `ignoreDuplicates` porque la carrera normal
    // aquí son dos compras simultáneas con el mismo texto: las dos quieren
    // escribir la misma versión y da igual cuál gane.
    await admin.from('terminos_versiones').upsert(
      { id: `tv-${studioId}-${hash.slice(0, 16)}`, studio_id: studioId, hash, texto },
      { onConflict: 'studio_id,hash', ignoreDuplicates: true },
    );

    return { hash, aceptadoEn: new Date().toISOString() };
  } catch {
    // Ver la nota de arriba: sin sello, pero la compra sigue.
    return null;
  }
}
