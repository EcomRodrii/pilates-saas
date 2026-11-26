// PAY-5 (auditoría 23-sep): doble suscripción al SaaS.
//
// El guard de «ya está activa» de /api/billing/checkout lee
// `studio.subscription_id`, que SOLO escribe el webhook. Entre el primer
// Checkout y la llegada de ese webhook pueden pasar minutos, y la clave de
// idempotencia de Stripe solo cubre el mismo minuto: dos intentos separados por
// más de 60 s eran dos Checkout Sessions reales y, pagadas las dos, dos
// suscripciones cobrando.
//
// La fuente de verdad no es nuestra BD sino Stripe. Antes de crear la sesión se
// le pregunta por lo que el customer ya tiene: una suscripción viva bloquea; un
// Checkout abierto del MISMO plan se reutiliza (la propietaria vuelve a la misma
// pantalla de pago en vez de abrir otra); uno abierto de OTRO plan se caduca,
// para que no queden dos formas de pagar a la vez.
//
// La decisión es pura y se prueba sola; `consultarCheckoutPrevio` solo hace las
// dos llamadas a Stripe.

import type Stripe from 'stripe';

// Los estados en que una suscripción de STRIPE sigue viva: 'past_due' incluido
// (Stripe sigue reintentando el cobro), y 'unpaid' porque sigue siendo una
// suscripción que no se ha cancelado. Solo estados de Stripe: 'gratis'
// (Founding Studio gratis) da acceso pero no es una suscripción, y no va aquí.
export const ESTADOS_VIVOS = ['active', 'trialing', 'past_due', 'unpaid'];

export interface SuscripcionPrevia { id: string; status: string }
/**
 * La «clave» con la que se compara un Checkout abierto: el plan y, si es anual,
 * `:anual`. Un Checkout mensual abierto NO se reutiliza para quien ahora pide el
 * anual del mismo plan (cobraría otra cosa de lo que ha elegido): se caduca y se
 * abre el nuevo, como con un plan distinto. Sin `intervalo` en la metadata (los
 * Checkout de antes del pago anual) cuenta como mensual.
 */
export function claveDePlan(plan: string | null | undefined, intervalo?: string | null): string | null {
  if (!plan) return null;
  return intervalo === 'anual' ? `${plan}:anual` : plan;
}

export interface SesionAbiertaPrevia {
  id: string; url: string | null; plan: string | null;
  /** `client_secret` de un Checkout con el pago DENTRO de nuestra pantalla (esos no tienen `url`). */
  secreto?: string | null;
  /** Lleva un descuento aplicado: caducarlo se lo haría perder. */
  conDescuento?: boolean;
}

export type DecisionCheckoutPrevio =
  | { accion: 'bloquear'; motivo: 'suscripcion-viva'; expirar: string[] }
  | { accion: 'reutilizar'; url?: string; secreto?: string; expirar: string[] }
  | { accion: 'crear'; expirar: string[] };

export function decidirCheckoutPrevio(p: {
  plan: string;
  suscripciones: readonly SuscripcionPrevia[];
  sesionesAbiertas: readonly SesionAbiertaPrevia[];
  /** Esta petición acaba de canjear un descuento: una sesión vieja no lo lleva. */
  hayDescuentoNuevo: boolean;
  /** Quien pide quiere el pago dentro de la pantalla de reactivación, no la página de Stripe. */
  incrustado?: boolean;
}): DecisionCheckoutPrevio {
  if (p.suscripciones.some(s => ESTADOS_VIVOS.includes(s.status))) {
    return { accion: 'bloquear', motivo: 'suscripcion-viva', expirar: [] };
  }
  const delMismoPlan = p.sesionesAbiertas.filter(s => s.plan === p.plan);
  // Sirve la que se puede abrir tal como se pide: con `url` (página de Stripe) o con
  // secreto (dentro de la pantalla). Quien pide lo segundo y tiene abierta la página
  // de Stripe CON descuento sigue en ella: caducarla le haría perder el descuento.
  const elegida = p.incrustado
    ? delMismoPlan.find(s => s.secreto) ?? delMismoPlan.find(s => s.url && s.conDescuento)
    : delMismoPlan.find(s => s.url);
  // Reutilizar solo si no se pierde el descuento recién canjeado y hay una sesión
  // que reutilizar; todo lo demás que siga abierto se caduca.
  if (!p.hayDescuentoNuevo && elegida) {
    const otras = p.sesionesAbiertas.filter(s => s.id !== elegida.id).map(s => s.id);
    return p.incrustado && elegida.secreto
      ? { accion: 'reutilizar', secreto: elegida.secreto, expirar: otras }
      : { accion: 'reutilizar', url: elegida.url as string, expirar: otras };
  }
  return { accion: 'crear', expirar: p.sesionesAbiertas.map(s => s.id) };
}

/** Lo que el cliente ya tiene en Stripe: sus suscripciones y sus Checkout de suscripción abiertos. */
export async function leerPagosDelCliente(
  stripe: Pick<Stripe, 'subscriptions' | 'checkout'>,
  customerId: string,
): Promise<{ suscripciones: SuscripcionPrevia[]; sesionesAbiertas: SesionAbiertaPrevia[] }> {
  const [subs, sesiones] = await Promise.all([
    stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 20 }),
    stripe.checkout.sessions.list({ customer: customerId, status: 'open', limit: 20 }),
  ]);
  return {
    suscripciones: subs.data.map(s => ({ id: s.id, status: s.status })),
    sesionesAbiertas: sesiones.data
      .filter(s => s.mode === 'subscription')
      .map(s => ({
        id: s.id, url: s.url, plan: claveDePlan(s.metadata?.plan, s.metadata?.intervalo),
        // Solo se reutiliza el incrustado de solo tarjeta, que es el que se crea hoy: uno abierto con otros
        // métodos se caduca y se abre de nuevo.
        secreto: s.payment_method_types?.join() === 'card' ? s.client_secret ?? null : null,
        conDescuento: Boolean(s.discounts?.length),
      })),
  };
}

export async function consultarCheckoutPrevio(
  stripe: Pick<Stripe, 'subscriptions' | 'checkout'>,
  customerId: string,
  plan: string,
  hayDescuentoNuevo: boolean,
  incrustado = false,
): Promise<DecisionCheckoutPrevio> {
  return decidirCheckoutPrevio({ plan, ...(await leerPagosDelCliente(stripe, customerId)), hayDescuentoNuevo, incrustado });
}
