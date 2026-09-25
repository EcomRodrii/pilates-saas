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

// Los mismos estados que `suscripcionActiva()` da por vivos: 'past_due' incluido
// (Stripe sigue reintentando el cobro), y 'unpaid' porque sigue siendo una
// suscripción que no se ha cancelado.
const ESTADOS_VIVOS = ['active', 'trialing', 'past_due', 'unpaid'];

export interface SuscripcionPrevia { id: string; status: string }
export interface SesionAbiertaPrevia { id: string; url: string | null; plan: string | null }

export type DecisionCheckoutPrevio =
  | { accion: 'bloquear'; motivo: 'suscripcion-viva'; expirar: string[] }
  | { accion: 'reutilizar'; url: string; expirar: string[] }
  | { accion: 'crear'; expirar: string[] };

export function decidirCheckoutPrevio(p: {
  plan: string;
  suscripciones: readonly SuscripcionPrevia[];
  sesionesAbiertas: readonly SesionAbiertaPrevia[];
  /** Esta petición acaba de canjear un descuento: una sesión vieja no lo lleva. */
  hayDescuentoNuevo: boolean;
}): DecisionCheckoutPrevio {
  if (p.suscripciones.some(s => ESTADOS_VIVOS.includes(s.status))) {
    return { accion: 'bloquear', motivo: 'suscripcion-viva', expirar: [] };
  }
  const delMismoPlan = p.sesionesAbiertas.filter(s => s.plan === p.plan && s.url);
  // Reutilizar solo si no se pierde el descuento recién canjeado y hay una sesión
  // que reutilizar; todo lo demás que siga abierto se caduca.
  if (!p.hayDescuentoNuevo && delMismoPlan.length > 0) {
    const elegida = delMismoPlan[0];
    const otras = p.sesionesAbiertas.filter(s => s.id !== elegida.id).map(s => s.id);
    return { accion: 'reutilizar', url: elegida.url as string, expirar: otras };
  }
  return { accion: 'crear', expirar: p.sesionesAbiertas.map(s => s.id) };
}

export async function consultarCheckoutPrevio(
  stripe: Pick<Stripe, 'subscriptions' | 'checkout'>,
  customerId: string,
  plan: string,
  hayDescuentoNuevo: boolean,
): Promise<DecisionCheckoutPrevio> {
  const [subs, sesiones] = await Promise.all([
    stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 20 }),
    stripe.checkout.sessions.list({ customer: customerId, status: 'open', limit: 20 }),
  ]);
  return decidirCheckoutPrevio({
    plan,
    suscripciones: subs.data.map(s => ({ id: s.id, status: s.status })),
    sesionesAbiertas: sesiones.data
      .filter(s => s.mode === 'subscription')
      .map(s => ({ id: s.id, url: s.url, plan: s.metadata?.plan ?? null })),
    hayDescuentoNuevo,
  });
}
