// ─────────────────────────────────────────────────────────────────────────────
// Interruptor de la prospección comercial en frío (/interno → Prospección).
//
// ⚠️ DESACTIVADA hasta que haya dictamen legal (auditoría RGPD 2026-09-13, A4 y
// E-1): hoy no se informa a quien recibe el correo de dónde salió su dirección
// (art. 14 RGPD), no hay lista de supresión persistente —la baja se marca a
// mano— y la LSSI art. 21 limita la comunicación comercial no solicitada.
//
// Solo el valor EXACTO `'1'` la enciende. Cualquier otra cosa —ausente, 'true',
// ' 1', 'yes'— la deja apagada: un interruptor que se enciende por accidente con
// un valor «parecido» no es un interruptor de seguridad. No se borra nada: los
// leads y borradores siguen ahí, solo que nada sale ni se prepara.
//
// La comprueban TODAS las puertas que preparan o envían: importar, generar con
// IA, aprobar/editar, encolar el lote, el worker de Inngest y el propio envío
// SMTP. Descartar un borrador sigue permitido: reduce lo que podría salir.
//
// Puro y sin dependencias: se prueba con `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

export const MOTIVO_PROSPECCION_DESACTIVADA =
  'Desactivada hasta revisión legal: falta información del art. 14 y lista de supresión.';

export function prospeccionActiva(env: Record<string, string | undefined>): boolean {
  return env.PROSPECCION_ACTIVA === '1';
}

/** `null` si puede seguir; si no, la respuesta que tiene que dar la ruta. */
export function bloqueoProspeccion(
  env: Record<string, string | undefined>,
): { status: 403; error: string; codigo: 'PROSPECCION_DESACTIVADA' } | null {
  if (prospeccionActiva(env)) return null;
  return { status: 403, error: MOTIVO_PROSPECCION_DESACTIVADA, codigo: 'PROSPECCION_DESACTIVADA' };
}
