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

/** El motivo de un rechazo, venga del cobro (`last_payment_error`) o de su cargo. */
type MotivoRechazo = { code?: string | null; decline_code?: string | null };

/**
 * El rechazo de un cargo fallido (`latest_charge`, expandido), o `null`. Al cancelar
 * el cobro, Stripe borra `last_payment_error`, pero su último cargo conserva el
 * motivo: `failure_code` y, en `outcome.reason`, el `decline_code` (medido el
 * 5-oct-2026 con tres tarjetas de prueba).
 */
export function rechazoDelCargo(cargo: string | Stripe.Charge | null | undefined): MotivoRechazo | null {
  if (!cargo || typeof cargo === 'string' || cargo.status !== 'failed') return null;
  return { code: cargo.failure_code ?? null, decline_code: cargo.outcome?.reason ?? null };
}

/**
 * Un cobro del datáfono de Stripe (card_present), en el contrato del TPV.
 * `rechazo`: el error con el que se quedó, cuando ya se comprobó que era un
 * rechazo y se CERRÓ (ver `cerrarSiRechazadoDatafono`). Va aparte porque al
 * cancelarlo Stripe borra `last_payment_error` (medido). Sin él, un cobro ya
 * cancelado cuyo último cargo falló también es un rechazo (`rechazoDelCargo`):
 * así se sabe aunque lo cerrara otro camino (el aviso de Stripe, el conciliador).
 * El motivo, en español.
 */
export function consultaDatafono(
  pi: Pick<Stripe.PaymentIntent, 'status' | 'last_payment_error' | 'amount_received' | 'metadata'>
    & { latest_charge?: Stripe.PaymentIntent['latest_charge'] },
  rechazo?: MotivoRechazo | null,
): ConsultaCobro {
  const cerrado = rechazo ?? (pi.status === 'canceled' ? rechazoDelCargo(pi.latest_charge) : null);
  const error = cerrado ?? pi.last_payment_error;
  return {
    estado: cerrado ? 'RECHAZADO' : estadoDesdeStripe(pi.status),
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

export type VeredictoDatafono = 'no' | 'sigue' | 'rechazado' | 'abandonado' | 'pagado';

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
 *   - `abandonado`: solo con `sinTarjeta` (el conciliador, pasados unos minutos):
 *     nadie llegó a pasar la tarjeta, el lector ya no lo espera, y se ha cancelado.
 *   - `pagado`: al ir a cerrarlo, había entrado.
 */
export async function cerrarSiRechazadoDatafono(
  stripe: ClienteDatafono, paymentIntentId: string, stripeAccount: string, readerId: string | null,
  opciones: { sinTarjeta?: boolean } = {},
): Promise<{ veredicto: VeredictoDatafono; pi: Stripe.PaymentIntent; rechazo?: Stripe.PaymentIntent.LastPaymentError }> {
  const opc = { stripeAccount };
  // Con el último cargo: es lo único que guarda el motivo de un rechazo ya cancelado.
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge'] }, opc);
  if (pi.status !== 'requires_payment_method') return { veredicto: 'no', pi };
  if (!pi.last_payment_error && !opciones.sinTarjeta) return { veredicto: 'no', pi };

  const lector = readerId
    ? lectorConElCobro(
      await stripe.terminal.readers.retrieve(readerId, {}, opc).then(r => r as Stripe.Terminal.Reader, () => undefined),
      paymentIntentId,
    )
    : 'sin-este';
  if (lector === 'con-este' || lector === 'no-se-sabe') return { veredicto: 'sigue', pi };

  // Solo el cobro, nunca la acción del lector: podría estar ya con otra venta.
  await stripe.paymentIntents.cancel(paymentIntentId, {}, opc).catch(() => undefined);
  const tras = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge'] }, opc);
  if (tras.status === 'canceled') {
    return pi.last_payment_error
      ? { veredicto: 'rechazado', pi: tras, rechazo: pi.last_payment_error }
      : { veredicto: 'abandonado', pi: tras };
  }
  if (tras.status === 'succeeded') return { veredicto: 'pagado', pi: tras };
  return { veredicto: 'sigue', pi: tras };
}

type ClienteAnular = {
  paymentIntents: Pick<Stripe['paymentIntents'], 'retrieve' | 'cancel'>;
  terminal: { readers: Pick<Stripe['terminal']['readers'], 'retrieve' | 'cancelAction'> };
};

/**
 * Anula un cobro del datáfono: «Cancelar el cobro» en la Caja, o un envío al
 * lector que falló con el cobro ya creado. Devuelve cómo ha quedado en Stripe
 * (`null`: no se ha podido saber).
 *
 * - La acción del lector solo se cancela si sigue con ESTE cobro: `cancelAction`
 *   cancela lo que esté haciendo, y podría ser ya el cobro de otra venta.
 * - El cobro se cancela aunque lo del lector falle (apagado, sin wifi): un cobro
 *   cancelado en Stripe ya no puede entrar, pase quien pase la tarjeta. Antes iban
 *   en el mismo `try`, y con el lector apagado el cobro se quedaba vivo.
 */
export async function anularCobroDelDatafono(
  stripe: ClienteAnular, paymentIntentId: string, stripeAccount: string, readerId: string | null,
): Promise<Stripe.PaymentIntent.Status | null> {
  // La cuenta Connect va en el TERCER argumento (opciones de petición), con `{}`
  // de parámetros: de segundo iría en el cuerpo y se tocaría la cuenta de la
  // plataforma, no la del estudio.
  const opc = { stripeAccount };
  if (readerId) {
    try {
      const lector = await stripe.terminal.readers.retrieve(readerId, {}, opc) as Stripe.Terminal.Reader;
      // ⚠️ Entre leerlo y pararlo, otra Caja puede mandarle su cobro (un envío nuevo
      // le quita el sitio al que espera tarjeta: medido) y se pararía el suyo. Stripe
      // no deja cancelar «solo si es este». No mueve dinero: ese cobro se queda fuera
      // del lector, su Caja espera y el conciliador lo cierra.
      if (lectorConElCobro(lector, paymentIntentId) === 'con-este') {
        await stripe.terminal.readers.cancelAction(readerId, {}, opc);
      }
    } catch (err) {
      console.error('[pos/datafono:anular] lector', err instanceof Error ? err.message : err);
    }
  }
  try {
    return (await stripe.paymentIntents.cancel(paymentIntentId, {}, opc)).status;
  } catch (err) {
    // Ya no admitía cancelación (acababa de entrar, o ya estaba cancelado) o no se
    // llegó a Stripe: manda lo que diga el cobro.
    console.error('[pos/datafono:anular] cobro', err instanceof Error ? err.message : err);
    return stripe.paymentIntents.retrieve(paymentIntentId, {}, opc).then(pi => pi.status, () => null);
  }
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

/**
 * Qué es un cobro del datáfono cuyo envío falló (`iniciar`, lib/pos/terminal.ts):
 *  - `enviado`: está o puede estar en el lector, o ya entró. Se sigue como enviado:
 *    lo resuelven el sondeo de la Caja, el aviso de Stripe o el conciliador.
 *  - `cerrado`: de este intento no puede entrar dinero. La Caja puede estrenar otro.
 *  - `no-se-sabe`: se mantiene el intento (ERROR), como siempre.
 *
 * `choque`: la clave de idempotencia ya estaba en uso. En una venta solo lo provoca
 * el reintento automático del SDK de Stripe (hasta 2, en errores de conexión y en
 * 409), que puede haber llegado a hacer lo que pedía; en un recibo, también otra
 * petición del mismo intento. Por eso con choque nunca se anula ni se cierra.
 * `estado`: cómo quedó el cobro tras `anularCobroDelDatafono` (solo sin choque).
 */
export function envioFallidoDatafono(
  o: { paso: 'crear'; choque: boolean } | { paso: 'enviar'; choque: boolean; estado: Stripe.PaymentIntent.Status | null },
): 'enviado' | 'cerrado' | 'no-se-sabe' {
  // Sin cobro creado nada puede entrar, y si se creó sin llegar la respuesta ningún
  // lector lo tiene. Con choque, otra petición del intento puede haberlo creado y
  // mandado al lector.
  if (o.paso === 'crear') return o.choque ? 'no-se-sabe' : 'cerrado';
  // Misma clave, mismo cobro: alguien lo está mandando al lector.
  if (o.choque) return 'enviado';
  // Entró justo antes de cancelarlo: lo cierra el sondeo, no se anula la venta.
  if (o.estado === 'succeeded') return 'enviado';
  return o.estado === 'canceled' ? 'cerrado' : 'no-se-sabe';
}
