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

export type CobroRepetido = 'usar' | 'nuevo' | 'pagado' | 'en-curso' | 'no-se-sabe';

/** La repetición de Stripe, contra el estado de AHORA del PaymentIntent. */
export function queHacerConCobroRepetido(statusActual: string | null | undefined): CobroRepetido {
  switch (statusActual) {
    // Se puede pagar: es el mismo cobro (otra pestaña del mismo intento).
    case 'requires_payment_method':
    case 'requires_confirmation':
      return 'usar';
    // Cancelado (abandonado): este intento necesita otro, con otra clave.
    case 'canceled':
      return 'nuevo';
    // Cobrado, o cobrándose: no se entrega ni se crea otro.
    case 'succeeded':
    case 'processing':
    case 'requires_capture':
      return 'pagado';
    // A medias (3DS en la app del banco): no se toca.
    case 'requires_action':
      return 'en-curso';
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
  /** Sigue pagable: se cancela antes de crear el nuevo. */
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
  if (!mismaPersona) return 'ajeno';
  switch (queHacerConCobroRepetido(pi.status)) {
    case 'usar': return 'cancelar';
    case 'nuevo': return 'ya-cancelado';
    case 'pagado': return 'pagado';
    case 'en-curso': return 'en-curso';
    default: return 'en-curso';
  }
}

export const MENSAJE_CLASE_YA_PAGADA =
  'Ya has pagado esta clase: te llegará la confirmación por email. No hace falta que la pagues otra vez.';

export const MENSAJE_PAGO_A_MEDIAS =
  'Tienes un pago de esta clase a medias (por ejemplo, esperando la confirmación de tu banco). Termínalo, o espera unos minutos y vuelve a intentarlo.';

export const MENSAJE_PAGO_SIN_COMPROBAR =
  'No hemos podido comprobar tu pago anterior. Inténtalo en un momento: no se te ha cobrado nada.';
