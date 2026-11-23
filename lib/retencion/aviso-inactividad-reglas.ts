// ─────────────────────────────────────────────────────────────────────────────
// A quién se le avisa de que lleva 30 días sin usar Tentare. Puro, sin `@/`: se prueba con `node --test`.
//
// Solo AVISA: nada de aquí cambia el estado de un estudio ni borra nada (el borrado, si llega, es otra
// decisión con su plazo y su copia). Lo que se mide es lo que ya mide `public.situacion_estudios()`
// (`dias_sin_actividad`), la misma fuente del informe de bajas: una sola definición de «inactivo».
// ─────────────────────────────────────────────────────────────────────────────

/** Días sin actividad real a partir de los cuales se avisa (decisión del fundador, 23-nov-2026). */
export const DIAS_AVISO_INACTIVIDAD = 30;

/**
 * Tope por pasada. El cron corre cada hora y el plan de Resend da 100 correos al día, que
 * comparten los códigos de acceso y los avisos de pago: un aviso de cortesía nunca puede
 * comérselos, ni aunque un día coincidan muchos estudios.
 */
export const MAX_AVISOS_POR_PASADA = 5;

/** Los estados en los que tiene sentido preguntar «¿te ayudamos?»: no paga y no está ya cerrado ni suspendido. */
export const ESTADOS_QUE_SE_AVISAN = ['GRATIS', 'GRATIS_EN_MARGEN', 'INACTIVO'] as const;

export interface FilaSituacionAviso {
  studio_id: string;
  estado: string;
  paga: boolean;
  es_demo: boolean;
  suspendido_a_mano: boolean;
  dias_sin_actividad: number;
}

/**
 * `AVISO_INACTIVIDAD=on` lo enciende; cualquier otro valor, o ninguno, es apagado. Por defecto NO manda
 * nada: mergear no escribe a ningún estudio, lo enciende el fundador a propósito en Vercel.
 */
export function avisoInactividadActivo(entorno: Record<string, string | undefined>): boolean {
  return entorno.AVISO_INACTIVIDAD?.trim() === 'on';
}

/**
 * Los estudios a los que toca avisar ahora: no pagan, no son demos, no están suspendidos a mano, llevan
 * 30 días o más sin actividad y no se les avisó antes. Primero los que más llevan, y como mucho `max`.
 */
export function elegirParaAvisar(
  filas: readonly FilaSituacionAviso[],
  yaAvisados: ReadonlySet<string>,
  max: number = MAX_AVISOS_POR_PASADA,
): FilaSituacionAviso[] {
  return filas
    .filter(f =>
      !f.paga && !f.es_demo && !f.suspendido_a_mano
      && (ESTADOS_QUE_SE_AVISAN as readonly string[]).includes(f.estado)
      && Number.isFinite(f.dias_sin_actividad) && f.dias_sin_actividad >= DIAS_AVISO_INACTIVIDAD
      && !yaAvisados.has(f.studio_id))
    .sort((a, b) => b.dias_sin_actividad - a.dias_sin_actividad || a.studio_id.localeCompare(b.studio_id))
    .slice(0, Math.max(0, max));
}
