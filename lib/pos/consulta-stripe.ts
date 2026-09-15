import type Stripe from 'stripe';
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
    // Abierta, o completada con el pago aún sin entrar.
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
