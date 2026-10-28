// Qué se escribe en `plataforma_lead` cuando alguien pide la demo. Lógica pura,
// aparte de la ruta, para probar las reglas sin base de datos.
//
// Las mismas reglas que el formulario de descargas (lib/recursos/descargas-lead.ts),
// porque el problema es el mismo: el correo NO está verificado y cualquiera
// puede escribir el de otra persona.
//   · Un lead que ya existe no se toca: ni nombre, ni estudio, ni teléfono, ni
//     notas, ni `actualizado_en` (alimenta la alerta de «N días parado»). Solo
//     se deja pendiente el permiso comercial si se pide.
//   · El permiso comercial nace PENDIENTE: solo cuenta cuando la dueña del correo
//     lo confirma. Aquí no hay correo de confirmación todavía, así que NO llega
//     a estar activo (más seguro que lo contrario).
//   · ⚠️ Origen `ALTA` y estado `DEMO` a propósito: el CHECK de `origen` no
//     admite un valor propio sin migración. Si se quiere separar en el CRM, es
//     una migración aditiva de una línea (ver docs/demo-personalizada.md).
import { TEXTO_CONSENTIMIENTO_NOVEDADES } from '../recursos/descargas.ts';
import { pedirConfirmacionNovedades, type EstadoNovedades } from '../recursos/descargas-lead.ts';
import type { DatosDemo } from './lead.ts';

export interface LeadExistenteDemo extends EstadoNovedades {
  id: string;
}

export type EscrituraLeadDemo =
  | { tipo: 'insertar'; id: string; fila: Record<string, unknown>; solicitud: boolean }
  | { tipo: 'actualizar'; id: string; cambios: Record<string, unknown>; solicitud: true }
  | { tipo: 'nada'; id: string };

export function escrituraLeadDemo(
  existente: LeadExistenteDemo | null,
  datos: DatosDemo,
  ahora: string,
  nuevoId: () => string,
): EscrituraLeadDemo {
  const permisoPendiente = {
    consentimiento_comercial: true,
    consentimiento_texto: TEXTO_CONSENTIMIENTO_NOVEDADES,
    consentimiento_en: ahora,
  };
  if (!existente) {
    return {
      tipo: 'insertar',
      id: nuevoId(),
      solicitud: datos.comercial,
      fila: {
        email: datos.email,
        nombre: datos.nombre,
        estudio: datos.estudio,
        telefono: datos.telefono,
        origen: 'ALTA',
        estado: 'DEMO',
        notas: `[demo] centro=${datos.tipoCentro}`,
        ...(datos.comercial ? permisoPendiente : {}),
        actualizado_en: ahora,
      },
    };
  }
  if (pedirConfirmacionNovedades(existente, datos.comercial)) {
    return { tipo: 'actualizar', id: existente.id, cambios: { ...permisoPendiente, actualizado_en: ahora }, solicitud: true };
  }
  return { tipo: 'nada', id: existente.id };
}

/** Líneas de `notas` que escribe la demo (acotadas: la columna es de texto libre). */
export const MAX_NOTAS = 2000;

export function anadirNota(previas: string | null, linea: string): string {
  const todas = previas ? `${previas}\n${linea}` : linea;
  return todas.length <= MAX_NOTAS ? todas : todas.slice(todas.length - MAX_NOTAS);
}
