// Fase 1 · Dunning — LÓGICA PURA de reintentos de cobro (sin red, sin Stripe;
// testeable con `node --test`). El efecto real (cobrar, actualizar el recibo,
// notificar) vive en lib/billing/dunning-server.ts.
//
// Flujo: al fallar un cobro, el recibo se reintenta a los +1, +3 y +7 días del
// vencimiento (3 reintentos en total). Si los tres fallan, pasa al estado
// terminal FALLIDO y requiere gestión manual. Si la socia paga después, el
// recibo pasa a COBRADO por la vía normal.
//
// Notificaciones a la socia: SOLO en el primer fallo (informativo) y en el fallo
// definitivo (acción requerida), nunca en los intermedios — así los pagos que se
// recuperan solos en el 2.º/3.er intento no generan ruido.

export const OFFSETS_REINTENTO_DIAS = [1, 3, 7] as const; // reintentos #1/#2/#3 tras el vencimiento
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

/**
 * Decide el siguiente paso tras un intento de cobro FALLIDO.
 * `intentosPrevios` = recibos.intentos_reintento ANTES de contar este fallo.
 */
export function planificarTrasFallo(intentosPrevios: number, fechaVencimiento: string, ahoraISO?: string): PlanReintento {
  const intentos = Math.max(0, intentosPrevios) + 1;
  const esPrimerFallo = intentos === 1;
  if (intentos >= MAX_REINTENTOS) {
    return { intentos, estado: 'FALLIDO', proximoReintento: null, esPrimerFallo, esDefinitivo: true };
  }
  // Anclar la cadencia al MÁS TARDÍO entre el vencimiento y ahora. Si el recibo se
  // creó con un vencimiento ya pasado (p.ej. renovación de una suscripción caducada:
  // el cron pone fecha_vencimiento = fecha_fin antigua), venc+{3,7} caería en el
  // pasado y el barrido diario dispararía los 3 reintentos casi seguidos en 1-2 días
  // —quemando la ventana de recuperación del cobro y enviando el "primer fallo" y el
  // "impago definitivo" a la vez—. Con `now` como suelo, la cadencia se reparte de
  // verdad. Para vencimientos futuros/hoy nada cambia (base = vencimiento).
  const ahora = ahoraISO ?? new Date().toISOString();
  const base = new Date(fechaVencimiento).getTime() > new Date(ahora).getTime() ? fechaVencimiento : ahora;
  return {
    intentos,
    estado: 'PENDIENTE',
    proximoReintento: sumarDiasISO(base, OFFSETS_REINTENTO_DIAS[intentos]),
    esPrimerFallo,
    esDefinitivo: false,
  };
}
