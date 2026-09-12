import type Stripe from 'stripe';

/**
 * Con qué método se pagó DE VERDAD una Checkout Session.
 *
 * Una sesión que ofrece `['card','bizum']` la puede acabar pagando la socia con
 * cualquiera de los dos: el origen dice qué se OFRECIÓ, no qué se usó. El único
 * sitio donde consta lo segundo es `payment_method_details.type` del cargo.
 *
 * Si no se ofreció Bizum es tarjeta y nos ahorramos la llamada a Stripe. Si la
 * lectura falla, se devuelve TARJETA: el desglose por método se equivoca, pero
 * no se tumba un cobro por no poder afinar un dato de arqueo. (Su hermano del
 * TPV, `lib/pos/metodo-real-bizum.ts`, hace lo contrario a propósito porque
 * allí el cobro se LANZÓ como Bizum y esa es la mejor pista disponible.)
 *
 * Punto único de esta derivación para todo lo que nace de una Checkout Session:
 * las dos ramas del webhook (`checkout.session.completed` → recibo y → compra
 * de plan) y las dos del conciliador, que es el camino REAL en 4 de cada 6
 * cobros. La rama de compra de plan escribía `metodo_cobro: 'TARJETA'` a pelo, y
 * desde que Bizum entra también por ahí (#1864 «pagar y reservar sin login»,
 * #1865 «Comprar» en la app de la alumna) el arqueo por método mentía en cada
 * bono pagado con Bizum.
 */
export async function metodoRealDeSesion(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
  account: string | null,
): Promise<'TARJETA' | 'BIZUM'> {
  const pmTypes = (session.payment_method_types ?? []) as string[];
  if (!pmTypes.includes('bizum') || typeof session.payment_intent !== 'string') return 'TARJETA';
  try {
    const piPago = await stripe.paymentIntents.retrieve(
      session.payment_intent, { expand: ['latest_charge'] },
      account ? { stripeAccount: account } : undefined,
    );
    const tipo = (piPago.latest_charge as Stripe.Charge | null)?.payment_method_details?.type;
    return tipo === 'bizum' ? 'BIZUM' : 'TARJETA';
  } catch {
    return 'TARJETA';
  }
}
