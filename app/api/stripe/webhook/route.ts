import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { dbUpdateRecibo, dbUpdateSocio } from '@/lib/supabase-data';

export async function POST(req: NextRequest) {
  const key = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!key || key.startsWith('sk_test_XXXX')) {
    return NextResponse.json({ error: 'Stripe no configurado' }, { status: 503 });
  }

  const stripe = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });
  const body = await req.text();
  const sig = req.headers.get('stripe-signature') ?? '';

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret ?? '');
  } catch {
    return NextResponse.json({ error: 'Webhook signature inválida' }, { status: 400 });
  }

  // Esta es la fuente de verdad real del pago — el redirect al navegador
  // (success_url) solo actualiza la UI de forma optimista, pero si el
  // navegador se cierra antes de volver, esto es lo único que sí confirma
  // el cobro contra la base de datos.
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const reciboId = session.metadata?.reciboId;
    const socioId = session.metadata?.socioId;

    if (reciboId) {
      await dbUpdateRecibo(reciboId, {
        estado: 'COBRADO',
        fechaCobro: new Date().toISOString(),
      });
    }

    // Guarda la tarjeta (Customer + PaymentMethod) para poder cobrar sola
    // la próxima vez, si Stripe llegó a crear el Customer y el pago se
    // completó con setup_future_usage.
    if (socioId && typeof session.customer === 'string' && typeof session.payment_intent === 'string') {
      const paymentIntent = await stripe.paymentIntents.retrieve(session.payment_intent);
      const paymentMethodId = typeof paymentIntent.payment_method === 'string'
        ? paymentIntent.payment_method
        : paymentIntent.payment_method?.id;
      if (paymentMethodId) {
        await dbUpdateSocio(socioId, {
          stripeCustomerId: session.customer,
          stripePaymentMethodId: paymentMethodId,
        });
      }
    }
  }

  return NextResponse.json({ received: true });
}
