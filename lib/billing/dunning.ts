// Fase 1 · Dunning — LÓGICA PURA de reintentos de cobro (sin red, sin Stripe;
// testeable con `node --test`). El efecto real (cobrar, actualizar el recibo,
// notificar) vive en lib/billing/dunning-server.ts.
//
// Flujo: tres intentos de cobro en total, los días +1, +3 y +7 del vencimiento.
// El del +1 es el primer cobro y no lo programa este módulo, sino quien crea el
// recibo (las renovaciones lo crean el día siguiente a `fecha_fin` y lo dejan
// listo para el barrido de esa mañana); los del +3 y el +7 son los reintentos
// que programa `planificarTrasFallo`. Si los tres fallan, pasa al estado
// terminal FALLIDO y requiere gestión manual. Si la socia paga después, el
// recibo pasa a COBRADO por la vía normal.
//
// Notificaciones a la socia: SOLO en el primer fallo (informativo) y en el fallo
// definitivo (acción requerida), nunca en los intermedios — así los pagos que se
// recuperan solos en el 2.º/3.er intento no generan ruido.

export const OFFSETS_REINTENTO_DIAS = [1, 3, 7] as const; // intentos #1/#2/#3: días tras el vencimiento
export const MAX_REINTENTOS = OFFSETS_REINTENTO_DIAS.length; // 3

export interface PlanReintento {
  intentos: number;                    // nuevo valor de recibos.intentos_reintento
  estado: 'PENDIENTE' | 'FALLIDO';     // nuevo estado del recibo
  proximoReintento: string | null;     // ISO 8601; null si FALLIDO (no más reintentos)
  esPrimerFallo: boolean;              // 1.er fallo → email informativo a la socia
  esDefinitivo: boolean;               // pasa a FALLIDO → email a la socia + aviso al estudio
}

/** Suma `dias` a una fecha base ('YYYY-MM-DD' o ISO) y devuelve ISO 8601. */
export function sumarDiasISO(fechaBase: string, dias: number): string {
  const base = new Date(fechaBase);
  return new Date(base.getTime() + dias * 24 * 60 * 60 * 1000).toISOString();
}

/** Momento del PRIMER reintento de un recibo recién creado (día +1 del vencimiento). */
export function primerReintentoISO(fechaVencimiento: string): string {
  return sumarDiasISO(fechaVencimiento, OFFSETS_REINTENTO_DIAS[0]);
}

/** El día ('YYYY-MM-DD', en UTC) de una fecha o de un instante ISO. */
function diaUTC(fechaOInstante: string): string {
  return new Date(fechaOInstante).toISOString().slice(0, 10);
}

/**
 * Decide el siguiente paso tras un intento de cobro FALLIDO.
 * `intentosPrevios` = recibos.intentos_reintento ANTES de contar este fallo.
 * `ahoraISO` = cuándo se registra el fallo: el `nowISO` del barrido, o la hora
 * del webhook en una devolución SEPA.
 *
 * El reintento va al día `vencimiento + OFFSETS_REINTENTO_DIAS[intentos]` (+3,
 * +7), a las 00:00 UTC. Lo que se programa es un DÍA, no una hora: el barrido
 * coge lo que tiene `proximo_reintento <= nowISO` una vez al día (08:30 UTC,
 * lib/inngest/dunning.ts), así que el reintento tiene que estar vencido antes
 * de que pase el barrido de su día. Hasta el 2-oct-2026 llevaba la hora del
 * fallo (08:30 y unos segundos), el barrido de ese día no lo veía por esos
 * segundos y cada reintento se iba al día siguiente: en producción salían el
 * +1, el +5 y el +13. Y como el fallo siempre ocurre después de las 00:00 del
 * vencimiento, la cadencia además se acumulaba desde cada fallo en vez de
 * contar desde el vencimiento. Lo ata a la hora del cron un test de
 * dunning.test.ts.
 *
 * Suelo (#353): nunca antes de la misma separación que hay entre un intento y
 * el siguiente (2 días tras el primero, 4 tras el segundo), contada desde el
 * día del fallo. Con un vencimiento ya pasado —una renovación adoptada tarde,
 * o una devolución SEPA que llega días después del adeudo— venc+3 y venc+7
 * caerían en el pasado y el barrido gastaría los intentos en días seguidos, con
 * el aviso de primer fallo y el de impago definitivo casi a la vez. Si todo va
 * en su día el suelo coincide con el vencimiento y no cambia nada.
 */
export function planificarTrasFallo(intentosPrevios: number, fechaVencimiento: string, ahoraISO: string): PlanReintento {
  const intentos = Math.max(0, intentosPrevios) + 1;
  const esPrimerFallo = intentos === 1;
  if (intentos >= MAX_REINTENTOS) {
    return { intentos, estado: 'FALLIDO', proximoReintento: null, esPrimerFallo, esDefinitivo: true };
  }
  const segunVencimiento = sumarDiasISO(diaUTC(fechaVencimiento), OFFSETS_REINTENTO_DIAS[intentos]);
  const separacion = OFFSETS_REINTENTO_DIAS[intentos] - OFFSETS_REINTENTO_DIAS[intentos - 1];
  const suelo = sumarDiasISO(diaUTC(ahoraISO), separacion);
  return {
    intentos,
    estado: 'PENDIENTE',
    // Mismo formato ISO en UTC: se comparan como texto.
    proximoReintento: segunVencimiento > suelo ? segunVencimiento : suelo,
    esPrimerFallo,
    esDefinitivo: false,
  };
}

// Hallazgo A (auditoría dunning 2026-08-10): decide si el fallo actual debe
// AUTO-CANCELAR la suscripción asociada al recibo — solo el fallo definitivo
// (3er reintento agotado) y solo si el recibo tiene una suscripción real
// vinculada (una penalización, p. ej., no tiene). Pura y testeable a propósito:
// el efecto (el UPDATE condicional en `suscripciones`) vive en
// dunning-server.ts, que es quien no se puede testear con `node --test` por
// las importaciones en cascada de `impago-server.ts`/`sellar-factura-server.ts`.
export function debeAutoCancelarSuscripcion(
  plan: Pick<PlanReintento, 'esDefinitivo'>,
  suscripcionId: string | null | undefined,
): boolean {
  return plan.esDefinitivo && !!suscripcionId;
}
