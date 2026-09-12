import type Stripe from 'stripe';

// `solicitarCapacidadBizum` (capacidad-bizum.ts) PIDE la capacidad al conectar
// la cuenta, pero pedirla no la activa: Stripe la deja `pending`/`inactive`
// hasta comprobar los datos fiscales de la cuenta CONECTADA. Mientras tanto,
// meter `bizum` en `payment_method_types` no falla "solo Bizum" -- Stripe
// rechaza el `checkout.sessions.create` ENTERO si cualquiera de los métodos
// pedidos no está activo en esa cuenta, así que la tarjeta (que sí funcionaría)
// se cae con ella. Confirmado en producción (2026-09-12): "The payment method
// type provided: bizum is invalid" tumbaba el cobro completo, en el panel
// (mostrador) y en la app de la alumna, para estudios cuya cuenta aún no tenía
// la capacidad activa.
//
// Por eso cualquier sitio que vaya a pedir Bizum debe comprobar esto ANTES de
// llamar a Stripe, no dejar que Stripe lo descubra por él. Fail-CLOSED: si no
// se puede confirmar que está activa, se trata como no activa -- no arriesgar
// tumbar un cobro con tarjeta por una lectura que falló.
export async function bizumActivo(stripe: Stripe, stripeAccount: string): Promise<boolean> {
  try {
    const cuenta = await stripe.accounts.retrieve(stripeAccount);
    return cuenta.capabilities?.bizum_payments === 'active';
  } catch {
    return false;
  }
}
