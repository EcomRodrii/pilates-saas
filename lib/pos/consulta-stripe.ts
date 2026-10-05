import type Stripe from 'stripe';
import { motivoRechazoDatafono } from './datafono.ts';
import { metodoRealBizum } from './metodo-real-bizum.ts';
import type { EstadoPagoPOS } from './tipos.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Preguntar a Stripe por un cobro del TPV. Fuera de `terminal.ts` (que es
// `server-only` y usa alias) para poder probarlo con node --test y un doble del
// cliente de Stripe.
// ─────────────────────────────────────────────────────────────────────────────

export interface ConsultaCobro {
  estado: EstadoPagoPOS;
  error?: string;
  importeCentimos?: number | null;
  metadata?: Record<string, string>;
  metodoReal?: 'BIZUM' | 'TARJETA';
  /**
   * El PaymentIntent que cobró, cuando la referencia guardada NO lo es (una
   * sesión de Checkout `cs_…`). Es el que tiene que quedar en el recibo o la
   * venta: de él cuelgan los reembolsos.
   */
  paymentIntentId?: string;
  /**
   * Solo el datáfono de SumUp: su id de transacción. Es el cargo que cierra un
   * recibo (`recibos.sumup_transaction_id`); nunca va a la columna de Stripe.
   */
  cargoSumup?: string;
}

// Se traduce en un solo sitio, y a un vocabulario nuestro: `requires_action` no
// significa nada en un mostrador. El default es ERROR, nunca PAGADO — un estado
// que no reconocemos jamás puede leerse como "cobrado".
export function estadoDesdeStripe(status: Stripe.PaymentIntent.Status): EstadoPagoPOS {
  switch (status) {
    case 'succeeded':                return 'PAGADO';
    case 'processing':               return 'PROCESANDO';
    case 'requires_payment_method':  return 'PENDIENTE';
    case 'requires_confirmation':
    case 'requires_action':
    case 'requires_capture':         return 'PROCESANDO';
    case 'canceled':                 return 'CANCELADO';
    default:                         return 'ERROR';
  }
}

/**
 * Un cobro del datáfono de Stripe (card_present), en el contrato del TPV.
 * `rechazo`: el error con el que se quedó, cuando ya se comprobó que era un
 * rechazo y se CERRÓ (ver `cerrarSiRechazadoDatafono`). Va aparte porque al
 * cancelarlo Stripe borra `last_payment_error` (medido). El motivo, en español.
 */
export function consultaDatafono(
  pi: Pick<Stripe.PaymentIntent, 'status' | 'last_payment_error' | 'amount_received' | 'metadata'>,
  rechazo?: Stripe.PaymentIntent.LastPaymentError | null,
): ConsultaCobro {
  const error = rechazo ?? pi.last_payment_error;
  return {
    estado: rechazo ? 'RECHAZADO' : estadoDesdeStripe(pi.status),
    error: error ? motivoRechazoDatafono(error) : undefined,
    importeCentimos: pi.amount_received ?? null,
    metadata: (pi.metadata ?? {}) as Record<string, string>,
  };
}

/** Qué está haciendo el lector con ESTE cobro. `undefined` = no se pudo leer el lector. */
export type LectorConElCobro = 'con-este' | 'fallo-este' | 'sin-este' | 'no-se-sabe';

export function lectorConElCobro(
  lector: { action?: { status?: string | null; process_payment_intent?: { payment_intent?: string | { id: string } | null } | null } | null } | null | undefined,
  paymentIntentId: string,
): LectorConElCobro {
  if (lector === undefined) return 'no-se-sabe';
  const accion = lector?.action;
  const pi = accion?.process_payment_intent?.payment_intent;
  if (!accion || (typeof pi === 'string' ? pi : pi?.id) !== paymentIntentId) return 'sin-este';
  if (accion.status === 'in_progress') return 'con-este';
  return accion.status === 'failed' ? 'fallo-este' : 'sin-este';
}

type ClienteDatafono = {
  paymentIntents: Pick<Stripe['paymentIntents'], 'retrieve' | 'cancel'>;
  terminal: { readers: Pick<Stripe['terminal']['readers'], 'retrieve'> };
};

export type VeredictoDatafono = 'no' | 'sigue' | 'rechazado' | 'pagado';

/**
 * ¿El cobro del datáfono se ha quedado en un rechazo? Y si sí, se CIERRA antes
 * de decirlo, para que nadie pueda cobrarlo después sobre una venta anulada o un
 * recibo suelto (mismo patrón que Bizum: se cierra y solo entonces se anula).
 *
 * ⚠️ Medido en modo de prueba (5-oct-2026): con una tarjeta rechazada, Stripe deja
 * el cobro en `requires_payment_method` con `last_payment_error`, y durante un
 * instante el lector SIGUE con él (`in_progress`) antes de quedar `failed`. Con un
 * datáfono físico, Stripe documenta además el reintento con PIN: el pago sin
 * contacto «se rechaza» (`offline_pin_required`…) y el lector pide insertar la
 * tarjeta y el PIN en la MISMA acción. Por eso el error del cobro solo no basta:
 *
 *   - `no`: no hay rechazo (sin error, o ya en otro estado).
 *   - `sigue`: el lector sigue con este cobro, no se ha podido saber, o no se ha
 *     podido cerrar. Se vuelve a preguntar; no se anula nada.
 *   - `rechazado`: el lector ya no está con él y se ha cancelado en Stripe. Con
 *     `rechazo`, el error que tenía al detectarlo (al cancelar, Stripe lo borra).
 *   - `pagado`: al ir a cerrarlo, había entrado.
 */
export async function cerrarSiRechazadoDatafono(
  stripe: ClienteDatafono, paymentIntentId: string, stripeAccount: string, readerId: string | null,
): Promise<{ veredicto: VeredictoDatafono; pi: Stripe.PaymentIntent; rechazo?: Stripe.PaymentIntent.LastPaymentError }> {
  const opc = { stripeAccount };
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {}, opc);
  if (pi.status !== 'requires_payment_method' || !pi.last_payment_error) return { veredicto: 'no', pi };

  const lector = readerId
    ? lectorConElCobro(
      await stripe.terminal.readers.retrieve(readerId, {}, opc).then(r => r as Stripe.Terminal.Reader, () => undefined),
      paymentIntentId,
    )
    : 'sin-este';
  if (lector === 'con-este' || lector === 'no-se-sabe') return { veredicto: 'sigue', pi };

  // Solo el cobro, nunca la acción del lector: podría estar ya con otra venta.
  await stripe.paymentIntents.cancel(paymentIntentId, {}, opc).catch(() => undefined);
  const tras = await stripe.paymentIntents.retrieve(paymentIntentId, {}, opc);
  if (tras.status === 'canceled') return { veredicto: 'rechazado', pi: tras, rechazo: pi.last_payment_error };
  if (tras.status === 'succeeded') return { veredicto: 'pagado', pi: tras };
  return { veredicto: 'sigue', pi: tras };
}

type ClienteConsulta = Pick<Stripe, 'paymentIntents' | 'checkout' | 'charges'>;

/**
 * Bizum del mostrador. La referencia es el PaymentIntent… salvo cuando Stripe
 * crea la sesión de Checkout sin él (lo crea al pagar): entonces se guardó la
 * sesión (`cs_…`), y `paymentIntents.retrieve` sobre ella fallaba siempre, así que
 * el mostrador se quedaba en PROCESANDO para siempre aunque la alumna hubiera
 * pagado o el enlace hubiera caducado.
 *
 * No poder preguntar no es «no pagado»: cualquier fallo es PROCESANDO.
 */
export async function consultarCobroBizum(
  stripe: ClienteConsulta, referencia: string, stripeAccount: string,
): Promise<ConsultaCobro> {
  try {
    if (!referencia.startsWith('cs_')) return await consultarPaymentIntent(stripe, referencia, stripeAccount);

    const sesion = await stripe.checkout.sessions.retrieve(referencia, {}, { stripeAccount });
    if (sesion.status === 'expired') return { estado: 'EXPIRADO' };
    if (sesion.status === 'complete' && sesion.payment_status === 'paid') {
      const pi = typeof sesion.payment_intent === 'string' ? sesion.payment_intent : sesion.payment_intent?.id ?? null;
      // Con su PaymentIntent, lo que diga ÉL (importe cobrado, metadata, método
      // real del cargo): es la misma verdad que lee el webhook.
      if (pi) return { ...(await consultarPaymentIntent(stripe, pi, stripeAccount)), paymentIntentId: pi };
      return {
        estado: 'PAGADO',
        importeCentimos: sesion.amount_total ?? null,
        metadata: (sesion.metadata ?? {}) as Record<string, string>,
      };
    }
    // Abierta: la alumna aún no ha pagado («Esperando el pago»). Completada con el
    // pago sin entrar: en curso.
    if (sesion.status === 'open') return { estado: 'PENDIENTE' };
    return { estado: 'PROCESANDO' };
  } catch {
    return { estado: 'PROCESANDO' };
  }
}

async function consultarPaymentIntent(stripe: ClienteConsulta, id: string, stripeAccount: string): Promise<ConsultaCobro> {
  const pi = await stripe.paymentIntents.retrieve(id, {}, { stripeAccount });
  return {
    estado: estadoDesdeStripe(pi.status),
    error: pi.last_payment_error?.message ?? undefined,
    importeCentimos: pi.amount_received ?? null,
    metadata: (pi.metadata ?? {}) as Record<string, string>,
    // Solo hace falta mirar el cargo real si de verdad se cobró: pedir
    // el cargo de un PI pendiente no tiene nada que resolver todavía.
    metodoReal: pi.status === 'succeeded' ? await metodoRealBizum(stripe as Stripe, pi, stripeAccount) : undefined,
  };
}
