// I-5: Red de seguridad para reembolsos y disputas no entregados por el webhook.
//
// El webhook responde 200 antes de procesar en `after()`, así que no reintentas
// si la lógica falla. Este cron busca lo que se perdió.
//
// Cadencia: cada 2h (mismo que ingresos), ventana de 24h hacia atrás.

import Stripe from 'stripe';
import * as Sentry from '@sentry/nextjs';
import { inngest } from './client';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';

const VENTANA_HORAS = 24;

export const conciliarReembolsos = inngest.createFunction(
  // cada 2 horas
  { id: 'conciliar-reembolsos-disputas', retries: 0, triggers: [{ cron: '0 */2 * * *' }] },
  async () => {
    const admin = getSupabaseAdmin();
    if (!admin) {
      Sentry.captureMessage('[conciliar-reembolsos] service role no configurada', 'error');
      return { error: 'No service role' };
    }

    try {
      const apiKey = process.env.STRIPE_SECRET_KEY;
      if (!apiKey) {
        Sentry.captureMessage('[conciliar-reembolsos] STRIPE_SECRET_KEY no configurada', 'error');
        return { error: 'No Stripe key' };
      }

      const stripe = new Stripe(apiKey);

      // Buscar reembolsos no procesados
      await conciliarRefunds(stripe, admin);

      // Buscar disputas no procesadas
      await conciliarDisputes(stripe, admin);

      return { ok: true };
    } catch (e) {
      Sentry.captureException(e, { tags: { area: 'cobros', tipo: 'conciliar-reembolsos' } });
      return { error: e instanceof Error ? e.message : 'Unknown error' };
    }
  }
);

async function conciliarRefunds(stripe: Stripe, admin: ReturnType<typeof getSupabaseAdmin>) {
  if (!admin) return;

  const ventanaInicio = new Date(Date.now() - VENTANA_HORAS * 3600 * 1000).toISOString();

  // Charges que fueron refundadas DESPUÉS de cierta fecha, sin estar en webhook_reembolsos.
  // La API de Stripe no filtra charges por `refunded` (ChargeListParams no lo
  // tiene) — se filtra aquí, en el código.
  const { data: charges } = await stripe.charges.list({
    created: { gte: Math.floor(Date.parse(ventanaInicio) / 1000) },
    limit: 100,
  });

  for (const charge of charges) {
    if (!charge.refunded || !charge.payment_intent) continue;

    const piId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent.id;

    // ¿Ya procesado?
    const { data: existing } = await admin
      .from('webhook_reembolsos')
      .select('id')
      .eq('pi_stripe_id', piId)
      .eq('charge_stripe_id', charge.id)
      .maybeSingle();

    if (existing) continue; // Ya procesado, nada que hacer

    // Registrar que lo procesamos (para no duplicar)
    const esTotal = charge.refunded === true && (charge.amount_refunded ?? 0) === charge.amount;
    await admin.from('webhook_reembolsos').insert({
      pi_stripe_id: piId,
      charge_stripe_id: charge.id,
      amount_refunded_cents: charge.amount_refunded ?? 0,
      total_charge_cents: charge.amount ?? 0,
      es_reembolso_total: esTotal,
    });

    console.log(`[conciliar-reembolsos] Refund recuperado: ${piId} (${charge.amount_refunded}/${charge.amount})`);
  }
}

async function conciliarDisputes(stripe: Stripe, admin: ReturnType<typeof getSupabaseAdmin>) {
  if (!admin) return;

  const ventanaInicio = new Date(Date.now() - VENTANA_HORAS * 3600 * 1000).toISOString();

  // Disputes CREADAS después de cierta fecha, sin estar en webhook_disputas
  const { data: disputes } = await stripe.disputes.list({
    created: { gte: Math.floor(Date.parse(ventanaInicio) / 1000) },
    limit: 100,
  });

  for (const dispute of disputes) {
    if (!dispute.payment_intent) continue;

    const piId = typeof dispute.payment_intent === 'string' ? dispute.payment_intent : dispute.payment_intent.id;

    // ¿Ya procesado?
    const { data: existing } = await admin
      .from('webhook_disputas')
      .select('id')
      .eq('pi_stripe_id', piId)
      .eq('dispute_stripe_id', dispute.id)
      .maybeSingle();

    if (existing) continue; // Ya procesado

    // Registrar que lo procesamos
    await admin.from('webhook_disputas').insert({
      pi_stripe_id: piId,
      dispute_stripe_id: dispute.id,
      dispute_status: dispute.status,
    });

    console.log(`[conciliar-reembolsos] Dispute recuperado: ${piId} (${dispute.status})`);
  }
}
