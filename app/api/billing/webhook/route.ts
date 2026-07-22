import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { planDePriceId } from '@/lib/billing/billing';
import { capturar } from '@/lib/analytics';
import { webhookYaProcesado, marcarWebhookProcesado } from '@/lib/webhook-idempotencia';
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

  // M10: idempotencia por event.id — saltar si ya se procesó con éxito.
  if (await webhookYaProcesado(admin, event.id)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

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

  // M10: marcar procesado solo si llegó aquí sin error (el catch devuelve 500 antes).
  await marcarWebhookProcesado(admin, event.id, event.type);
  return NextResponse.json({ received: true });
}

async function actualizarSuscripcion(admin: SupabaseClient, sub: Stripe.Subscription) {
  // Plan CADENA: una sola suscripción cubre varias sedes (studios.cadena_id).
  // metadata.cadenaId la puso el checkout (ver app/api/billing/checkout).
  const cadenaId = sub.metadata?.cadenaId ?? null;
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

  if (cadenaId) {
    // `cadenas` es la única fuente de verdad para el billing de una cadena —
    // el trigger propagar_plan_cadena (migración 0065) hace el fan-out a
    // TODAS sus sedes en la misma transacción. No tocar `studios` aquí.
    const { error } = await admin.from('cadenas').update(update).eq('id', cadenaId);
    if (error) throw new Error(`update cadenas: ${error.message}`);
    capturar(cadenaId, { nombre: 'suscripcion_cambiada', props: { plan, estado: sub.status } });
    return;
  }

  if (studioId) {
    const { error } = await admin.from('studios').update(update).eq('id', studioId);
    if (error) throw new Error(`update studios: ${error.message}`);
    // R4: señal de ciclo de vida de la suscripción (alta/renovación/impago/baja).
    capturar(studioId, { nombre: 'suscripcion_cambiada', props: { plan, estado: sub.status } });
    return;
  }

  // Sin metadata (legacy, o edición manual en el dashboard de Stripe): el
  // mismo stripe_customer_id puede pertenecer a un estudio individual o a una
  // cadena — son dos tablas independientes, así que hay que probar ambas. Un
  // UPDATE que no matchea ninguna fila NO da error en Supabase, de ahí el
  // `.select('id')` para saber si de verdad escribió algo antes de caer al
  // siguiente candidato (si no, el estado de la cadena queda obsoleto en
  // silencio y Stripe nunca reintenta porque el webhook responde 200).
  const { data: enStudios, error: studiosError } = await admin
    .from('studios').update(update).eq('stripe_customer_id', customerId).select('id');
  if (studiosError) throw new Error(`update studios: ${studiosError.message}`);
  if (enStudios && enStudios.length > 0) return;

  const { error: cadenasError } = await admin.from('cadenas').update(update).eq('stripe_customer_id', customerId);
  if (cadenasError) throw new Error(`update cadenas (fallback sin metadata): ${cadenasError.message}`);
}
