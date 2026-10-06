// ─────────────────────────────────────────────────────────────────────────────
// El intento de pago de una clase (checkout embebido): qué hacer con el cobro que
// ya existe para él. Puro y sin alias `@/`, para fijarlo con `node --test`.
//
// La clave de idempotencia identifica el INTENTO. Dos cosas pueden pasar con el
// cobro que Stripe ya tiene para él:
//
//  1. La REPETICIÓN: misma clave y mismos parámetros. Stripe no crea otro: devuelve
//     el primero tal como era al CREARSE, aunque desde entonces se haya cancelado
//     (el conciliador cancela los abandonados) o cobrado. Entregar su client_secret
//     sin mirar era una hoja de pago muerta, o una sobre un pago terminado. Se
//     decide con el cobro de AHORA (`queHacerConCobroRepetido`).
//
//  2. El PAGO ANTERIOR de la misma pantalla: si la persona vuelve atrás y cambia
//     algo que sí es otro intento (otro plan, otro código), o algo que cambia el
//     importe (la matrícula gratis se agotó a medianoche), la clave o los
//     parámetros ya no son los del cobro que tiene en pantalla. La pantalla manda
//     el client_secret de ese cobro; el servidor comprueba que es el SUYO (mismo
//     secreto, estudio, clase y persona), lo cancela —si Stripe lo confirma— y
//     devuelve lo que retenía (plaza de cupo y matrícula gratis, con las mismas
//     claves que el conciliador, así que no se devuelve dos veces). Un cobro por
//     pantalla, nunca dos pagables.
// ─────────────────────────────────────────────────────────────────────────────

export type CobroRepetido = 'usar' | 'nuevo' | 'cancelar-y-nuevo' | 'pagado' | 'en-curso' | 'no-se-sabe';

/**
 * Lo que tarda un 3DS en darse por abandonado (5-oct-2026). Stripe no caduca un
 * PaymentIntent en `requires_action`: si la pestaña o el navegador de Instagram se
 * cerró a mitad del desafío, se queda así para siempre, y con la misma clave cada
 * intento nuevo de esa clase recibía «a medias» durante 24 h. Pasado esto se cancela
 * (Stripe lo permite en `requires_action`) y el intento sigue con otro cobro. Un
 * desafío del banco no dura tanto; y si alguien lo aprueba después de cancelarlo, el
 * cobro falla: nunca se cobra dos veces.
 */
export const MINUTOS_3DS_ABANDONADO = 10;

export interface ContextoCobroRepetido {
  /** `pi.created`, en segundos. Sin él, un 3DS nunca se da por abandonado. */
  creadoEnSeg?: number | null;
  ahora?: Date;
  /** El cargo está devuelto ENTERO (`charge.refunded`): ese pago ya no cuenta. */
  reembolsado?: boolean;
}

export function tresDSAbandonado(ctx: ContextoCobroRepetido): boolean {
  if (typeof ctx.creadoEnSeg !== 'number' || !Number.isFinite(ctx.creadoEnSeg) || !ctx.ahora) return false;
  return ctx.ahora.getTime() - ctx.creadoEnSeg * 1000 >= MINUTOS_3DS_ABANDONADO * 60_000;
}

/** La repetición de Stripe, contra el estado de AHORA del PaymentIntent. */
export function queHacerConCobroRepetido(statusActual: string | null | undefined, ctx: ContextoCobroRepetido = {}): CobroRepetido {
  switch (statusActual) {
    // Se puede pagar: es el mismo cobro (otra pestaña del mismo intento).
    case 'requires_payment_method':
    case 'requires_confirmation':
      return 'usar';
    // Cancelado (abandonado): este intento necesita otro, con otra clave.
    case 'canceled':
      return 'nuevo';
    // Cobrado… salvo que se le haya devuelto entero: entonces es un intento nuevo.
    case 'succeeded':
      return ctx.reembolsado ? 'nuevo' : 'pagado';
    // Cobrándose: no se entrega ni se crea otro.
    case 'processing':
    case 'requires_capture':
      return 'pagado';
    // A medias (3DS): reciente, no se toca; abandonado, se cancela y se sigue.
    case 'requires_action':
      return tresDSAbandonado(ctx) ? 'cancelar-y-nuevo' : 'en-curso';
    default:
      return 'no-se-sabe';
  }
}

/** Clave de un cobro nuevo del mismo intento cuando el de su clave ya no sirve. */
export const claveTrasCobro = (clave: string, cobroMuerto: string) => `${clave}:tras-${cobroMuerto}`;

export interface CobroAnterior {
  id: string;
  status: string;
  client_secret: string | null;
  metadata: Record<string, string> | null | undefined;
}

export interface IntentoDeClase {
  studioId: string;
  sesionId: string | null;
  /** Ya derivado del JWT en la ruta, nunca del body. */
  socioId: string | null;
  socioEmail: string | null;
}

export type DecisionPagoAnterior =
  /** No es de esta pantalla, de este estudio, de esta clase o de esta persona: no se toca. */
  | 'ajeno'
  /** Sigue pagable (o a medias en el banco): se cancela antes de crear el nuevo. */
  | 'cancelar'
  /** Ya estaba cancelado: el nuevo necesita otra clave. */
  | 'ya-cancelado'
  | 'pagado'
  | 'en-curso';

const mismoEmail = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

export function decidirPagoAnterior(pi: CobroAnterior, secretoEnviado: string, intento: IntentoDeClase): DecisionPagoAnterior {
  const md = pi.metadata ?? {};
  // Quien manda el secreto es quien tiene ese cobro en pantalla: sin él, nada.
  if (!pi.client_secret || pi.client_secret !== secretoEnviado) return 'ajeno';
  if (md.origen !== 'plan_web_embebido' || md.studioId !== intento.studioId) return 'ajeno';
  if ((md.sesionId ?? null) !== intento.sesionId) return 'ajeno';
  const mismaPersona = intento.socioId
    ? md.socioId === intento.socioId
    : !md.socioId && mismoEmail(md.socioEmail, intento.socioEmail);
  if (!mismaPersona) {
    // Tiene el secreto (lo creó ESTA pantalla) pero ha cambiado quién paga (otro email en /reservar, o ha entrado
    // con su cuenta): el cobro anterior se CANCELA si todavía se puede, para que no queden dos pagables de la misma
    // clase. Nunca se le dice «pagado» ni «a medias» de un cobro de otra persona: si no se puede cancelar, se ignora.
    if (pi.status === 'requires_action') return 'cancelar';
    const r = queHacerConCobroRepetido(pi.status);
    return r === 'usar' || r === 'cancelar-y-nuevo' ? 'cancelar' : r === 'nuevo' ? 'ya-cancelado' : 'ajeno';
  }
  // Un 3DS a medias de ESTA pantalla: si ha vuelto atrás y continúa, lo ha dejado.
  // Se cancela (si el banco lo aprueba después, el cobro falla: nunca dos cobros).
  if (pi.status === 'requires_action') return 'cancelar';
  switch (queHacerConCobroRepetido(pi.status)) {
    case 'usar': return 'cancelar';
    case 'nuevo': return 'ya-cancelado';
    case 'cancelar-y-nuevo': return 'cancelar';
    case 'pagado': return 'pagado';
    case 'en-curso': return 'en-curso';
    default: return 'en-curso';
  }
}

export const MENSAJE_PAGO_A_MEDIAS =
  'Tu banco todavía está esperando que confirmes un pago de esta clase. Confírmalo en la app de tu banco; si lo dejaste a medias, podrás volver a pagar dentro de un rato (como mucho, media hora). No se te cobrará dos veces.';

// ─────────────────────────────────────────────────────────────────────────────
// «Ya has pagado esta clase», solo si es verdad lo que se le dice (5-oct-2026).
// Antes era siempre «te llegará la confirmación por email», también a quien pagó y
// se quedó sin plaza (clase llena, tope semanal), a quien la canceló después o a
// quien ya se le devolvió el dinero: podía presentarse en clase sin estar apuntada.
// Se dice lo que hay: lo que dice su reserva (`res-web-<pago>`), si el pago aún se
// procesa, o si ya se entregó lo comprado y no tiene plaza. Un pago devuelto entero
// no llega aquí: es un intento nuevo (`queHacerConCobroRepetido`).
// ─────────────────────────────────────────────────────────────────────────────

export interface SituacionClasePagada {
  /** `processing`/`requires_capture` → procesando; `succeeded` → cobrado. */
  cobro: 'procesando' | 'cobrado';
  /** Lo comprado ya se entregó (existe su recibo `rec-web-…`). */
  entregado: boolean;
  /** Estado de la reserva de ESTE pago (`res-web-…`), o null si no la hay. */
  reserva: string | null;
}

export function mensajeClaseYaPagada(s: SituacionClasePagada): string {
  if (s.cobro === 'procesando') {
    return 'Tu pago de esta clase se está procesando: te avisaremos por email en cuanto se confirme. No hace falta que la pagues otra vez.';
  }
  if (s.reserva === 'CONFIRMADA' || s.reserva === 'ASISTIDA') {
    return 'Ya has pagado esta clase y tienes tu plaza. No hace falta que la pagues otra vez.';
  }
  if (s.reserva === 'LISTA_ESPERA') {
    return 'Ya pagaste esta clase y estás en su lista de espera: si queda un sitio, te avisaremos. No hace falta que la pagues otra vez.';
  }
  if (s.reserva === 'PENDIENTE_APROBACION') {
    return 'Ya pagaste esta clase y tu reserva está pendiente de que el estudio la apruebe. No hace falta que la pagues otra vez.';
  }
  if (!s.entregado) {
    return 'Tu pago de esta clase ya se ha hecho y estamos preparando tu reserva: te llegará un email. No hace falta que la pagues otra vez.';
  }
  return 'Ya pagaste esta clase, pero ahora no tienes plaza en ella. Lo que compraste está en tu cuenta: entra con tu email para reservar con ello, o escribe al estudio.';
}

export const MENSAJE_PAGO_SIN_COMPROBAR =
  'No hemos podido comprobar tu pago anterior. Inténtalo en un momento: no se te ha cobrado nada.';
