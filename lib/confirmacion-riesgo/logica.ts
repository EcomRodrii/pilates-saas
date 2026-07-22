// Ventanas de tiempo de "pedir confirmación de riesgo de plantón" — puro y
// testeable, sin fecha ambigua: SIEMPRE horas-hasta-la-clase, nunca "ahora".
//
// Se pide confirmación con una banda ANCHA (20-30h antes), no un instante
// exacto: el barrido corre cada pocas horas, y una banda estrecha dejaría
// escapar reservas si el barrido cae justo fuera de ella.
//
// El CORTE (liberar la plaza) es más sensible al tiempo: cuanto más tarde se
// libera, menos margen tiene la lista de espera para enterarse y prepararse.
// Por eso el barrido de corte corre con más frecuencia (cada 30 min) que el
// de aviso, y por eso aquí se exige horas > 0 — liberar una plaza de una clase
// que ya empezó no tiene sentido, la promoción llegaría tarde.

export const VENTANA_ASK_HORAS_MIN = 20;
export const VENTANA_ASK_HORAS_MAX = 30;

/** Cuántas horas antes de la clase se da por perdida la confirmación. Decisión
 * del estudio (no del código): 3h deja toda la noche y la mañana para
 * responder, y margen de sobra para que la lista de espera se entere. */
export const CUTOFF_HORAS_ANTES = 3;

// Recordatorio a mitad de camino entre el aviso y el corte. Hueco encontrado
// probando en vivo: un solo email que se pierde en la bandeja se convertía en
// una cancelación real de alguien que sí pensaba venir. Banda ancha (10-14h),
// no un instante exacto, por el mismo motivo que la ventana de aviso — el
// barrido corre cada 30 min, no al segundo.
export const VENTANA_RECORDATORIO_HORAS_MIN = 10;
export const VENTANA_RECORDATORIO_HORAS_MAX = 14;

export function horasHasta(inicioISO: string, ahora: Date): number {
  return (new Date(inicioISO).getTime() - ahora.getTime()) / (1000 * 60 * 60);
}

export function enVentanaDeAviso(horas: number): boolean {
  return horas >= VENTANA_ASK_HORAS_MIN && horas <= VENTANA_ASK_HORAS_MAX;
}

export function tocaRecordar(horas: number): boolean {
  return horas >= VENTANA_RECORDATORIO_HORAS_MIN && horas <= VENTANA_RECORDATORIO_HORAS_MAX;
}

/** ¿Ya pasó el corte de confirmación? Solo cuenta mientras la clase no haya
 * empezado — pasada la hora de inicio, liberar la plaza no sirve de nada. */
export function pasoElCorte(horas: number): boolean {
  return horas <= CUTOFF_HORAS_ANTES && horas > 0;
}
