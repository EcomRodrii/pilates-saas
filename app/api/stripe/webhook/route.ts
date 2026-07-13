import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export async function POST(req: NextRequest) {
  const key = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  // Los eventos de las cuentas conectadas (Stripe Connect) llegan a este mismo
  // endpoint pero firmados con un secreto de webhook distinto — el que
  // Stripe genera en el endpoint "Connect" del Dashboard, no el de la cuenta
  // de la plataforma.
  const connectWebhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
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
    try {
      event = stripe.webhooks.constructEvent(body, sig, connectWebhookSecret ?? '');
    } catch {
      return NextResponse.json({ error: 'Webhook signature inválida' }, { status: 400 });
    }
  }

  // Esta es la fuente de verdad real del pago — el redirect al navegador
  // (success_url) solo actualiza la UI de forma optimista, pero si el
  // navegador se cierra antes de volver, esto es lo único que sí confirma
  // el cobro contra la base de datos.
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const reciboId = session.metadata?.reciboId;
    const socioId = session.metadata?.socioId;

    // P0-18: la persistencia se hace con service-role (bypassa RLS; el webhook
    // no tiene sesión de usuario) y cualquier fallo de escritura devuelve un
    // 5xx para que Stripe REINTENTE la entrega. Antes, dbUpdate* solo hacía
    // console.error sin lanzar y el endpoint respondía 200 igualmente: el pago
    // se cobraba en Stripe pero el recibo quedaba PENDIENTE para siempre.
    const admin = getSupabaseAdmin();
    if (!admin) {
      console.error('[stripe webhook] service role no configurada');
      return NextResponse.json({ error: 'Persistencia no disponible' }, { status: 503 });
    }

    // El recibo es lo crítico (confirma el cobro). Idempotente: reintentar sobre
    // un recibo ya COBRADO no cambia nada relevante.
    if (reciboId) {
      const { error } = await admin.from('recibos')
        .update({ estado: 'COBRADO', fecha_cobro: new Date().toISOString() })
        .eq('id', reciboId);
      if (error) {
        console.error('[stripe webhook] no se pudo marcar el recibo como COBRADO', reciboId, error);
        return NextResponse.json({ error: 'Fallo al persistir el cobro' }, { status: 500 });
      }
    }

    // Guarda la tarjeta (Customer + PaymentMethod) para poder cobrar sola la
    // próxima vez. También crítico: un fallo aquí devuelve 5xx para reintentar
    // (idempotente: mismos customer/payment_method).
    if (socioId && typeof session.customer === 'string' && typeof session.payment_intent === 'string') {
      // Este PaymentIntent vive en la cuenta conectada del estudio (event.account),
      // no en la de la plataforma — hay que targetearla explícitamente o Stripe
      // devuelve "no such payment_intent".
      const paymentIntent = await stripe.paymentIntents.retrieve(
        session.payment_intent,
        {},
        event.account ? { stripeAccount: event.account } : undefined
      );
      const paymentMethodId = typeof paymentIntent.payment_method === 'string'
        ? paymentIntent.payment_method
        : paymentIntent.payment_method?.id;
      if (paymentMethodId) {
        const { error } = await admin.from('socios')
          .update({ stripe_customer_id: session.customer, stripe_payment_method_id: paymentMethodId })
          .eq('id', socioId);
        if (error) {
          console.error('[stripe webhook] no se pudo guardar la tarjeta de la socia', socioId, error);
          return NextResponse.json({ error: 'Fallo al guardar el método de pago' }, { status: 500 });
        }
      }
    }
  }

  // A-14 (backstop): el cobro por datáfono se confirma aquí aunque el POS se haya
  // cerrado tras el tap. Deja un marcador de reconciliación (idempotente por
  // PaymentIntent) para que ningún cobro quede sin registrar. El flujo normal del
  // POS lo marcará RECONCILIADO; si no llega a hacerlo, queda PENDIENTE y el staff
  // lo completa desde el POS. Solo aplica a los PI de terminal (origen marcado al
  // crearlos en /api/terminal/cobrar); el resto de payment_intent.succeeded se
  // ignora (los cobros con checkout ya se persisten vía checkout.session.completed).
  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object as Stripe.PaymentIntent;
    if (pi.metadata?.origen === 'pos_terminal') {
      const studioId = pi.metadata.studioId;
      if (!studioId) {
        console.error('[stripe webhook] PI de terminal sin studioId en metadata', pi.id);
        return NextResponse.json({ received: true });
      }
      const admin = getSupabaseAdmin();
      if (!admin) {
        console.error('[stripe webhook] service role no configurada (reconciliación POS)');
        return NextResponse.json({ error: 'Persistencia no disponible' }, { status: 503 });
      }
      // Insert idempotente: si el POS ya registró la venta y marcó el marcador
      // RECONCILIADO, la PK del PaymentIntent hace que este INSERT choque (23505)
      // y no pisamos ese estado. Cualquier otro error → 5xx para que Stripe
      // reintente la entrega (no perder el cobro).
      const { error } = await admin.from('reconciliaciones_pos').insert({
        payment_intent_id: pi.id,
        studio_id: studioId,
        importe: (pi.amount_received ?? pi.amount ?? 0) / 100,
        concepto: pi.metadata.concepto ?? 'Venta POS',
      });
      if (error && error.code !== '23505') {
        console.error('[stripe webhook] no se pudo registrar la reconciliación POS', pi.id, error);
        return NextResponse.json({ error: 'Fallo al registrar la reconciliación' }, { status: 500 });
      }
    }
  }

  // Stripe Connect: el estudio revocó el acceso desde SU panel de Stripe (o Stripe
  // desconectó la cuenta). Limpiamos el binding `stripe_account_id` para que la app
  // deje de intentar cobrar sobre una cuenta ya no conectada y la UI muestre "no
  // conectado". Idempotente: si ya está a null, el UPDATE no casa ninguna fila.
  if (event.type === 'account.application.deauthorized') {
    const accountId = event.account;
    if (accountId) {
      const admin = getSupabaseAdmin();
      if (!admin) {
        console.error('[stripe webhook] service role no configurada (deauthorized)');
        return NextResponse.json({ error: 'Persistencia no disponible' }, { status: 503 });
      }
      const { error } = await admin.from('studios').update({ stripe_account_id: null }).eq('stripe_account_id', accountId);
      if (error) {
        console.error('[stripe webhook] no se pudo desvincular la cuenta desconectada', accountId, error);
        return NextResponse.json({ error: 'Fallo al desvincular la cuenta' }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ received: true });
}
