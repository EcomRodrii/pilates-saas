import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { planDePriceId } from '@/lib/billing';
import type { SupabaseClient } from '@supabase/supabase-js';

// Webhook de Stripe Billing (suscripción del estudio al SaaS). Distinto del
// webhook de Connect (pagos de socias). Fuente de verdad del estado de la
// suscripción: actualiza studios.subscription_status/plan/current_period_end.
// Requiere su propio secreto: STRIPE_BILLING_WEBHOOK_SECRET.
export async function POST(req: NextRequest) {
  const key = process.env.STRIPE_SECRET_KEY;
  const whSecret = process.env.STRIPE_BILLING_WEBHOOK_SECRET;
  if (!key || key.startsWith('sk_test_XXXX')) {
    return NextResponse.json({ error: 'Stripe no configurado' }, { status: 503 });
  }
  const stripe = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });
  const bodyText = await req.text();
  const sig = req.headers.get('stripe-signature') ?? '';

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(bodyText, sig, whSecret ?? '');
  } catch {
    return NextResponse.json({ error: 'Firma de webhook inválida' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  try {
    if (event.type.startsWith('customer.subscription.')) {
      await actualizarSuscripcion(admin, event.data.object as Stripe.Subscription);
    } else if (event.type === 'checkout.session.completed') {
      const s = event.data.object as Stripe.Checkout.Session;
      if (s.mode === 'subscription' && typeof s.subscription === 'string') {
        const sub = await stripe.subscriptions.retrieve(s.subscription);
        await actualizarSuscripcion(admin, sub);
      }
    }
  } catch (err) {
    // Log a Sentry vía consola; devolvemos 500 para que Stripe reintente.
    console.error('[billing webhook]', err);
    return NextResponse.json({ error: 'Error al procesar el webhook' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function actualizarSuscripcion(admin: SupabaseClient, sub: Stripe.Subscription) {
  const studioId = sub.metadata?.studioId ?? null;
  const priceId = sub.items?.data?.[0]?.price?.id ?? null;
  const plan = planDePriceId(priceId) ?? (sub.metadata?.plan as string | undefined) ?? null;
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;

  // current_period_end puede venir en la suscripción o en el item (según versión).
  const periodEndUnix =
    (sub as unknown as { current_period_end?: number }).current_period_end ??
    (sub.items?.data?.[0] as unknown as { current_period_end?: number } | undefined)?.current_period_end ??
    null;

  const update: Record<string, unknown> = {
    subscription_id: sub.id,
    subscription_status: sub.status,
    stripe_customer_id: customerId,
    current_period_end: periodEndUnix ? new Date(periodEndUnix * 1000).toISOString() : null,
  };
  if (plan) update.plan = plan;

  const q = admin.from('studios').update(update);
  const { error } = studioId
    ? await q.eq('id', studioId)
    : await q.eq('stripe_customer_id', customerId);
  // Si falla la escritura, propagamos para que el POST devuelva 500 y Stripe
  // reintente (no silenciamos como hacía el webhook de Connect).
  if (error) throw new Error(`update studios: ${error.message}`);
}
