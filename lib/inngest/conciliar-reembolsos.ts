// ─────────────────────────────────────────────────────────────────────────────
// I-5 · Red de seguridad para reembolsos y disputas no entregados por el
// webhook (el webhook responde 200 antes de procesar en `after()`; si esa
// llamada muere, Stripe no reintenta y nadie más lo sabe).
//
// Auditoría 17ª pasada (26-ago-2026), hallazgo P-1: este cron era un placebo.
// Dos bugs, los dos reales:
//   1. `stripe.charges.list(...)` SIN `{stripeAccount}` — los cobros de
//      socias son direct charges en cuentas CONECTADAS; a nivel de
//      plataforma esto no veía casi nada. Y filtraba por la fecha de
//      CREACIÓN del charge, no la del reembolso — un charge antiguo
//      reembolsado hoy quedaba fuera de la ventana.
//   2. Al encontrar algo, solo insertaba una fila en `webhook_reembolsos`
//      ("ya lo vi"): nunca marcaba el recibo DEVUELTO, nunca llamaba a
//      `registrarDevolucion`, nunca notificaba. Y como esa tabla solo la
//      escribía este mismo cron, la PRIMERA pasada dejaba la fila "vista"
//      para siempre sin haber aplicado nada.
//
// Arreglo: mismo patrón que `conciliar-cobros.ts` (iterar por estudio con
// `{stripeAccount}`) + la lógica de negocio REAL, compartida con el webhook
// vía `lib/billing/procesar-reembolso.ts` — nunca reimplementada aquí.
//
// `webhook_reembolsos`/`webhook_disputas` pasan a ser lo que su nombre
// sugiere: un registro de AUDITORÍA de lo que este cron recuperó (con
// `recibo_id`), no la fuente de idempotencia — esa la dan
// `.neq('estado','DEVUELTO')` sobre `recibos` y el UNIQUE de `devoluciones`
// por `referencia` (`registrarDevolucion` es idempotente de verdad: un
// reintento devuelve `null` sin duplicar nada).
//
// Alcance: refunds (total/parcial) y disputas creadas/cerradas (`lost` =
// chargeback real). `refund.failed`/`charge.refund.updated` (D-8, la
// devolución que falla DÍAS después) se deja fuera de este barrido a
// propósito — es un caso mucho más fino (requiere el charge fresco con
// `amount_refunded` ya decrementado, y decide si HAY que revertir un flip ya
// aplicado) y el propio webhook ya lo cubre en tiempo real; ampliar el
// alcance de este cron a eso es una mejora aparte, no bloqueante para cerrar
// P-1.
//
// Cadencia: cada 2h (mismo que ingresos), ventana de 24h hacia atrás — por
// la propia fecha del refund/dispute, no la del charge.
// ─────────────────────────────────────────────────────────────────────────────
import Stripe from 'stripe';
import * as Sentry from '@sentry/nextjs';
import { inngest } from './client';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { fetchAllRows } from '@/lib/supabase-data';
import { ORIGENES_CON_RECIBO, procesarChargeRefunded, procesarDisputeCreated, procesarDisputeClosed } from '@/lib/billing/procesar-reembolso';
import { origenDeReembolso } from '@/lib/billing/registrar-devolucion';
import type { SupabaseClient } from '@supabase/supabase-js';

const VENTANA_HORAS = 24;

// Techo defensivo del autopaginado, mismo criterio que `conciliar-cobros.ts`:
// no es el límite de trabajo esperado (un estudio no tiene cientos de
// reembolsos en 24h), es el freno para que un filtro roto no deje el barrido
// girando sobre miles de páginas en silencio.
const TECHO = 500;

export const conciliarReembolsos = inngest.createFunction(
  // cada 2 horas
  { id: 'conciliar-reembolsos-disputas', retries: 0, triggers: [{ cron: '0 */2 * * *' }] },
  async () => {
    const admin = getSupabaseAdmin();
    if (!admin) {
      Sentry.captureMessage('[conciliar-reembolsos] service role no configurada', 'error');
      return { error: 'No service role' };
    }

    const apiKey = process.env.STRIPE_SECRET_KEY;
    if (!apiKey || apiKey.startsWith('sk_test_XXXX')) {
      return { skipped: 'stripe no configurado' };
    }

    const { data: studios } = await fetchAllRows<{ id: string; stripe_account_id: string }>(
      '(global)', 'studios',
      (from, to) => admin
        .from('studios')
        .select('id, stripe_account_id')
        .not('stripe_account_id', 'is', null)
        .is('suspendido_en', null)
        .range(from, to),
    );
    if (!studios.length) return { estudios: 0, reembolsos: 0, disputas: 0 };

    const stripe = new Stripe(apiKey, { apiVersion: '2026-06-24.dahlia' });
    let reembolsos = 0;
    let disputas = 0;
    for (const s of studios) {
      const studio = s as { id: string; stripe_account_id: string };
      try {
        reembolsos += await conciliarRefundsEstudio(admin, stripe, studio);
      } catch (e) {
        Sentry.captureException(e instanceof Error ? e : new Error('conciliar-reembolsos'), {
          level: 'error', tags: { area: 'cobros', tipo: 'conciliar-reembolsos' }, extra: { studioId: studio.id },
        });
      }
      try {
        disputas += await conciliarDisputesEstudio(admin, stripe, studio);
      } catch (e) {
        Sentry.captureException(e instanceof Error ? e : new Error('conciliar-disputas'), {
          level: 'error', tags: { area: 'cobros', tipo: 'conciliar-disputas' }, extra: { studioId: studio.id },
        });
      }
    }
    return { estudios: studios.length, reembolsos, disputas };
  }
);

async function conciliarRefundsEstudio(
  admin: SupabaseClient,
  stripe: Stripe,
  studio: { id: string; stripe_account_id: string },
): Promise<number> {
  const desde = Math.floor(Date.now() / 1000) - VENTANA_HORAS * 3600;
  let aplicados = 0;
  let vistos = 0;

  // Se lista por la fecha de CREACIÓN DEL REEMBOLSO, no la del charge: un
  // charge antiguo reembolsado hoy tiene que entrar en la ventana de hoy. El
  // `charge` se expande para leer `amount`/`amount_refunded`/`refunded` sin
  // una llamada aparte por reembolso.
  for await (const refund of stripe.refunds.list(
    { created: { gte: desde }, limit: 100, expand: ['data.charge'] },
    { stripeAccount: studio.stripe_account_id },
  )) {
    vistos++;
    if (vistos > TECHO) {
      Sentry.captureMessage('[conciliar-reembolsos] techo de paginado de refunds alcanzado', {
        level: 'error', tags: { area: 'cobros', tipo: 'techo-paginado' },
        extra: { studioId: studio.id, techo: TECHO },
      });
      break;
    }
    // `pending`/`canceled` todavía no movió dinero de verdad; `failed` es
    // justo el caso D-8 que este cron deja fuera de alcance (ver cabecera).
    if (refund.status !== 'succeeded') continue;

    const charge = typeof refund.charge === 'string' ? null : refund.charge;
    if (!charge) continue; // el expand debería traerlo siempre; defensivo.
    const piId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
    if (!piId) continue;

    let pi: Stripe.PaymentIntent;
    try {
      pi = await stripe.paymentIntents.retrieve(piId, {}, { stripeAccount: studio.stripe_account_id });
    } catch (e) {
      Sentry.captureException(e instanceof Error ? e : new Error('conciliar-reembolsos retrieve PI'), {
        level: 'error', tags: { area: 'cobros', tipo: 'conciliar-reembolsos' },
        extra: { studioId: studio.id, paymentIntentId: piId },
      });
      continue;
    }

    const reciboId = pi.metadata?.reciboId;
    const esRecibo = ORIGENES_CON_RECIBO.has(pi.metadata?.origen ?? '');
    if (!reciboId || !esRecibo) continue;

    const resultado = await procesarChargeRefunded(admin, {
      studioId: studio.id, reciboId, origenPi: pi.metadata?.origen,
      charge: {
        id: charge.id, refunded: charge.refunded === true,
        amount: charge.amount ?? null, amountRefunded: charge.amount_refunded ?? null,
      },
      fuente: 'conciliador',
    });

    // Registro de AUDITORÍA de lo recuperado — no es la fuente de
    // idempotencia (esa la da `procesarChargeRefunded` por sí mismo), así
    // que un fallo aquí no debe tumbar el barrido.
    const esTotal = origenDeReembolso({
      refunded: charge.refunded === true, acumulado: charge.amount_refunded ?? 0, total: charge.amount ?? 0,
    }) === 'REEMBOLSO_TOTAL';
    const { error: errAuditoria } = await admin.from('webhook_reembolsos').upsert({
      pi_stripe_id: piId,
      charge_stripe_id: charge.id,
      recibo_id: reciboId,
      amount_refunded_cents: charge.amount_refunded ?? 0,
      total_charge_cents: charge.amount ?? 0,
      es_reembolso_total: esTotal,
    }, { onConflict: 'pi_stripe_id,charge_stripe_id' });
    if (errAuditoria) {
      console.error('[conciliar-reembolsos] no se pudo dejar el registro de auditoría', piId, errAuditoria.message);
    }

    if (!resultado.ok) {
      Sentry.captureMessage('[conciliar-reembolsos] refund recuperado pero no se pudo aplicar', {
        level: 'error', tags: { area: 'cobros', tipo: 'conciliar-reembolsos-fallo' },
        extra: { studioId: studio.id, reciboId, paymentIntentId: piId, error: resultado.error },
      });
      continue;
    }
    if (resultado.huboEfecto) {
      aplicados++;
      // El webhook NO hizo su trabajo: se avisa siempre que este barrido
      // aplica algo de verdad, mismo criterio que `conciliar-cobros.ts`.
      Sentry.captureMessage('[conciliar-reembolsos] refund recuperado (el webhook no lo entregó)', {
        level: 'warning', tags: { area: 'cobros', tipo: 'conciliado' },
        extra: { studioId: studio.id, reciboId, paymentIntentId: piId, chargeId: charge.id },
      });
    }
  }
  return aplicados;
}

async function conciliarDisputesEstudio(
  admin: SupabaseClient,
  stripe: Stripe,
  studio: { id: string; stripe_account_id: string },
): Promise<number> {
  const desde = Math.floor(Date.now() / 1000) - VENTANA_HORAS * 3600;
  let aplicadas = 0;
  let vistas = 0;

  for await (const dispute of stripe.disputes.list(
    { created: { gte: desde }, limit: 100 },
    { stripeAccount: studio.stripe_account_id },
  )) {
    vistas++;
    if (vistas > TECHO) {
      Sentry.captureMessage('[conciliar-reembolsos] techo de paginado de disputes alcanzado', {
        level: 'error', tags: { area: 'cobros', tipo: 'techo-paginado' },
        extra: { studioId: studio.id, techo: TECHO },
      });
      break;
    }

    const piId = typeof dispute.payment_intent === 'string' ? dispute.payment_intent : dispute.payment_intent?.id;
    if (!piId) continue;

    let pi: Stripe.PaymentIntent;
    try {
      pi = await stripe.paymentIntents.retrieve(piId, {}, { stripeAccount: studio.stripe_account_id });
    } catch (e) {
      Sentry.captureException(e instanceof Error ? e : new Error('conciliar-disputas retrieve PI'), {
        level: 'error', tags: { area: 'cobros', tipo: 'conciliar-disputas' },
        extra: { studioId: studio.id, paymentIntentId: piId },
      });
      continue;
    }

    const reciboId = pi.metadata?.reciboId;
    const esRecibo = ORIGENES_CON_RECIBO.has(pi.metadata?.origen ?? '');
    if (!reciboId || !esRecibo) continue;

    // `open`/`under_review`/etc → todavía no está cerrada: aplica el efecto
    // de "creada" (marca disputa_estado + avisa), idempotente porque el
    // UPDATE de `disputa_estado` no discrimina por valor previo. Un estado
    // cerrado (`lost`/`won`/`warning_closed`/…) aplica el cierre, que sí
    // mueve dinero si es `lost`.
    const cerrada = dispute.status === 'lost' || dispute.status === 'won' || dispute.status === 'warning_closed';
    const resultado = cerrada
      ? await procesarDisputeClosed(admin, {
          studioId: studio.id, reciboId, disputeStatus: dispute.status, disputeId: dispute.id,
          chargeId: typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id ?? null,
          amount: dispute.amount ?? null, fuente: 'conciliador',
        })
      : await procesarDisputeCreated(admin, {
          studioId: studio.id, reciboId, disputeStatus: dispute.status, disputeId: dispute.id,
          dueByUnix: dispute.evidence_details?.due_by ?? null, fuente: 'conciliador',
        });

    const { error: errAuditoria } = await admin.from('webhook_disputas').upsert({
      pi_stripe_id: piId,
      dispute_stripe_id: dispute.id,
      recibo_id: reciboId,
      dispute_status: dispute.status,
    }, { onConflict: 'pi_stripe_id,dispute_stripe_id' });
    if (errAuditoria) {
      console.error('[conciliar-reembolsos] no se pudo dejar el registro de auditoría de disputa', piId, errAuditoria.message);
    }

    if (!resultado.ok) {
      Sentry.captureMessage('[conciliar-reembolsos] disputa recuperada pero no se pudo aplicar', {
        level: 'error', tags: { area: 'cobros', tipo: 'conciliar-disputas-fallo' },
        extra: { studioId: studio.id, reciboId, paymentIntentId: piId, error: resultado.error },
      });
      continue;
    }
    if (resultado.huboEfecto) {
      aplicadas++;
      Sentry.captureMessage('[conciliar-reembolsos] disputa recuperada (el webhook no la entregó)', {
        level: 'warning', tags: { area: 'cobros', tipo: 'conciliado' },
        extra: { studioId: studio.id, reciboId, paymentIntentId: piId, disputeId: dispute.id, disputeStatus: dispute.status },
      });
    }
  }
  return aplicadas;
}
