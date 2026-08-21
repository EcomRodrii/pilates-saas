import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { planDePriceId } from '@/lib/billing/billing';
import { capturar } from '@/lib/analytics';
import * as Sentry from '@sentry/nextjs';
import { reclamarWebhookEvent, marcarWebhookProcesado, claveWebhook } from '@/lib/webhook-idempotencia';
import { enviarEmailFalloPagoSaas } from '@/lib/emails/fallo-pago-saas-server';
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
  } catch (err) {
    // Antes esto fallaba en TOTAL SILENCIO — ni log ni Sentry. Así estuvo roto
    // varios días (18→21-ago) sin que nadie se enterara: un estudio pagó de
    // verdad, Stripe entregó el evento, la firma no verificó, y el 400 se
    // perdió sin dejar rastro — la suscripción se quedó en `trialing` para
    // siempre y nada avisó. `error` siempre, sin condicionales: si falta el
    // secreto es un fallo nuestro de configuración; si está puesto pero no
    // verifica, puede ser tráfico probando la URL, pero es EXACTAMENTE el
    // mismo síntoma que un secreto rotado en Stripe sin actualizar Vercel —
    // Sentry agrupa por fingerprint, así que esto no se convierte en una
    // alarma que suena sin parar por ruido de internet.
    Sentry.captureMessage('[billing webhook] firma inválida — la suscripción del estudio puede quedarse sin sincronizar', {
      level: 'error',
      tags: { area: 'cobros', tipo: whSecret ? 'firma-no-verifica' : 'secreto-no-configurado' },
      extra: { error: err instanceof Error ? err.message : String(err), secretoConfigurado: Boolean(whSecret) },
    });
    return NextResponse.json({ error: 'Firma de webhook inválida' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  // M10: idempotencia por event.id — reclamación atómica: saltar si ya se
  // procesó con éxito o hay otra entrega en vuelo dentro de la ventana.
  // Acotada al ámbito 'billing': este webhook NO puede reclamar el evento en
  // nombre del de Connect (ver comentario en lib/webhook-idempotencia.ts).
  const claveEvento = claveWebhook('billing', event.id);
  if (!await reclamarWebhookEvent(admin, claveEvento, event.type)) {
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
      } else if (s.mode === 'payment') {
        // Un checkout en modo `payment` NO es una suscripción al SaaS: es una
        // compra de una socia (un bono, un recibo), y su sitio es
        // /api/stripe/webhook. Aquí no se entrega —hacerlo sería duplicar la
        // lógica del otro webhook— pero tampoco se calla.
        //
        // Antes esto caía en el `if` sin `else` y se respondía 200 en silencio:
        // así se perdió el cobro de 1 € del 8-ago-2026, y solo se descubrió
        // porque la socia dijo que no le había llegado el bono.
        //
        // `warning`, no `error` (2026-08-11). Cuando se escribió esto, que un
        // evento llegara aquí SÍ significaba dinero sin entregar: el destino de
        // Connect no lo procesaba. Desde que ese camino funciona, Stripe entrega
        // el mismo evento a los dos destinos, cada uno con su propia reclamación
        // (el prefijo de ámbito de `webhook-idempotencia.ts`), y el de Connect lo
        // entrega en milisegundos — comprobado en producción: evento recibido a
        // las 01:09:35.743 y bono entregado a las 01:09:35.793.
        //
        // O sea que esto ya no marca una pérdida, marca una suscripción de más en
        // el panel de Stripe. Sigue mereciendo un registro —el día que alguien
        // toque los destinos, aquí se ve— pero a nivel `error` sonaba en CADA
        // compra de socia, y una alarma que suena siempre es exactamente como se
        // acaban ignorando las que importan.
        //
        // ⚠️ Si esto vuelve a subir a `error`, que sea porque se ha comprobado
        // que el destino de Connect NO está entregando — no por precaución
        // genérica.
        Sentry.captureMessage('[billing webhook] checkout de PAGO en el webhook del SaaS', {
          level: 'warning',
          tags: { area: 'cobros', tipo: 'destino-equivocado' },
          extra: {
            sessionId: s.id,
            eventAccount: event.account ?? null,
            metadata: s.metadata ?? null,
            pista: 'Ruido esperado mientras este destino siga suscrito a checkout.session.completed: '
              + 'lo entrega /api/stripe/webhook. Para silenciarlo del todo, quita ese tipo de evento '
              + 'de la suscripción del destino del SaaS en Stripe. Si además el bono NO llega, entonces '
              + 'el problema no es este aviso: mira el destino de Connect.',
          },
        });
      }
    } else if (event.type === 'invoice.payment_failed') {
      // Primer aviso proactivo a la propietaria de que SU suscripción a Tentare
      // no se ha podido cobrar (tarjeta caducada/sin fondos). Antes de esto, el
      // único rastro era `subscription_status` cambiando a `past_due` en
      // silencio — la propietaria no se enteraba hasta que el estudio se
      // suspendía (`studios.suspendido_en`) semanas después. Best-effort: un
      // fallo al enviar el email nunca debe hacer que Stripe reintente el
      // webhook entero.
      try {
        await avisarFalloPagoSaas(admin, event.data.object as Stripe.Invoice);
      } catch (e) {
        console.error('[billing webhook] fallo al avisar de invoice.payment_failed', e);
      }
    }
  } catch (err) {
    // Log a Sentry vía consola; devolvemos 500 para que Stripe reintente.
    console.error('[billing webhook]', err);
    return NextResponse.json({ error: 'Error al procesar el webhook' }, { status: 500 });
  }

  // M10: marcar procesado solo si llegó aquí sin error (el catch devuelve 500 antes).
  await marcarWebhookProcesado(admin, claveEvento);
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
    // el trigger propagar_plan_cadena (migración 0066) hace el fan-out a
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
    // Review Boost: señal directa "vino de Review Boost y pagó", sin tener que
    // cruzar tablas en PostHog. Gate en `active` (no en cada actualización de
    // una suscripción ya activa) para no repetirlo en cada renovación.
    if (sub.status === 'active') {
      const { data: recompensa } = await admin
        .from('review_boost_recompensas').select('id').eq('studio_id', studioId).maybeSingle();
      if (recompensa) capturar(studioId, { nombre: 'review_boost_converted_to_paid', props: {} });
    }
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

async function avisarFalloPagoSaas(admin: SupabaseClient, invoice: Stripe.Invoice): Promise<void> {
  const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
  if (!customerId) return;
  const proximoIntento = invoice.next_payment_attempt
    ? new Date(invoice.next_payment_attempt * 1000).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', timeZone: 'Europe/Madrid' })
    : undefined;

  // Igual que actualizarSuscripcion: el mismo stripe_customer_id puede ser un
  // estudio individual o una cadena — dos tablas independientes, hay que
  // probar ambas. El destinatario es la propietaria REAL (owner_auth_user_id →
  // auth.users), no `studios.email` (contacto público del estudio, de cara a
  // sus socias) — mismo criterio que ya usa la ficha 360º del panel interno
  // (app/api/interno/estudios/[id]/route.ts).
  const { data: studio } = await admin.from('studios').select('nombre, plan, owner_auth_user_id').eq('stripe_customer_id', customerId).maybeSingle();
  if (studio?.owner_auth_user_id) {
    const { data: userRes } = await admin.auth.admin.getUserById(studio.owner_auth_user_id as string);
    if (userRes?.user?.email) {
      await enviarEmailFalloPagoSaas({ to: userRes.user.email, estudioNombre: (studio.nombre as string) ?? 'tu estudio', plan: (studio.plan as string) ?? 'actual', proximoIntento });
    }
    return;
  }
  const { data: cadena } = await admin.from('cadenas').select('nombre, plan, owner_auth_user_id').eq('stripe_customer_id', customerId).maybeSingle();
  if (!cadena?.owner_auth_user_id) return;
  const { data: userRes } = await admin.auth.admin.getUserById(cadena.owner_auth_user_id as string);
  if (userRes?.user?.email) {
    await enviarEmailFalloPagoSaas({ to: userRes.user.email, estudioNombre: (cadena.nombre as string) ?? 'tu cadena', plan: (cadena.plan as string) ?? 'actual', proximoIntento });
  }
}
