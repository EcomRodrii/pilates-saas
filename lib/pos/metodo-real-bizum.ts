import type Stripe from 'stripe';

/**
 * Método REAL con el que se cerró un cobro lanzado como Bizum del mostrador.
 *
 * La sesión de Bizum del TPV acepta `['card', 'bizum']` (#1744): una clienta
 * puede pagar con tarjeta un cobro que se lanzó como "Bizum". El origen
 * (`pos_bizum`) dice qué PROVEEDOR se usó para lanzarlo, no qué medio empleó
 * la clienta al final — hay que leer `payment_method_details.type` del cargo
 * real. Punto único de esta derivación: lo usan el webhook y los dos caminos
 * síncronos (recibo/venta) para no divergir entre sí (P-3, 27ª pasada;
 * extendido a los tres caminos en la 28ª tras encontrar que solo se había
 * arreglado el backstop del webhook, no el sondeo síncrono que gana casi
 * siempre la carrera, ni las ventas de producto).
 */
export async function metodoRealBizum(
  stripe: Stripe,
  paymentIntent: Pick<Stripe.PaymentIntent, 'latest_charge'>,
  stripeAccount?: string,
): Promise<'BIZUM' | 'TARJETA'> {
  try {
    const chargeId = typeof paymentIntent.latest_charge === 'string'
      ? paymentIntent.latest_charge
      : paymentIntent.latest_charge?.id;
    if (!chargeId) return 'BIZUM';
    const charge = await stripe.charges.retrieve(
      chargeId, {}, stripeAccount ? { stripeAccount } : undefined,
    );
    return charge.payment_method_details?.type === 'bizum' ? 'BIZUM' : 'TARJETA';
  } catch {
    // Si falla la lectura, nos quedamos con BIZUM (el origen como pista) en
    // vez de tumbar el cierre del cobro por no poder afinar el desglose.
    return 'BIZUM';
  }
}
