import type Stripe from 'stripe';

// Cupón único global (no uno por estudio): 20% de descuento, solo el primer
// mes. Id fijo y determinista para que crearlo sea idempotente — nada de paso
// manual en el dashboard de Stripe antes de poder usar Review Boost.
export const REVIEW_BOOST_CUPON_ID = 'review_boost_20';

export async function obtenerOCrearCuponReviewBoost(stripe: Stripe): Promise<string> {
  try {
    await stripe.coupons.retrieve(REVIEW_BOOST_CUPON_ID);
    return REVIEW_BOOST_CUPON_ID;
  } catch {
    await stripe.coupons.create({
      id: REVIEW_BOOST_CUPON_ID,
      percent_off: 20,
      duration: 'once',
      name: 'Review Boost — 20% primer mes',
    });
    return REVIEW_BOOST_CUPON_ID;
  }
}
