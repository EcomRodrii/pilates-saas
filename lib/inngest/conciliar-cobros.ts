// ─────────────────────────────────────────────────────────────────────────────
// Red de seguridad: entrega lo que Stripe ya cobró y el webhook no entregó.
//
// Por qué existe. En dos días se perdieron dos cobros reales por dos causas
// distintas, y lo que tenían en común no era la causa: era que entregar lo
// comprado dependía de UN SOLO canal, el webhook. Si ese canal falla —por una
// firma que no cuadra, por un destino mal repartido, o porque sencillamente no
// hay ningún destino configurado, que es lo que pasaba— la venta se pierde en
// silencio y nos enteramos porque la clienta se queja.
//
// Esto le pregunta a Stripe directamente, con `STRIPE_SECRET_KEY`, sin depender
// de que ningún webhook esté bien enrutado ni de ningún secreto de firma.
//
// No sustituye al webhook: cuando el webhook funcione, entregará él en
// segundos y este barrido no encontrará nada que hacer. Los dos caminos usan
// `entregarPlanComprado`, que es idempotente por ids deterministas, así que
// convivir no duplica nada.
//
// Cadencia cada 5 min: el peor caso que ve una socia es esperar ese rato a que
// aparezca su bono. Query global sin fan-out por estudio (misma lección que
// reservas-pendientes/lista-espera): una invocación por tic, no una por
// estudio, que es lo que se comió la cuota de Inngest en su día.
// ─────────────────────────────────────────────────────────────────────────────
import Stripe from 'stripe';
import * as Sentry from '@sentry/nextjs';
import { inngest } from './client';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { entregarPlanComprado, idsDe } from '@/lib/billing/entregar-plan-comprado';
import { aplicarRenovacionServidor } from '@/lib/billing/renovacion-server';
import { pendientesDeEntregar, type SesionCobrada, type Pendiente } from '@/lib/billing/conciliar-sesiones';
import type { SupabaseClient } from '@supabase/supabase-js';

// Cuánto atrás se mira. Generoso a propósito: con el barrido cada 5 minutos
// sobra, pero si Vercel se queda sin desplegar unas horas —ya ha pasado— o
// Inngest se atasca, al volver hay que recuperar lo de ese hueco, no solo lo
// último. No más: pasado un día, un cobro sin entregar ya no es un retraso
// recuperable sin mirarlo a mano.
const VENTANA_HORAS = 12;

async function conciliarEstudio(
  admin: SupabaseClient,
  stripe: Stripe,
  studio: { id: string; stripe_account_id: string },
): Promise<number> {
  const desde = Math.floor(Date.now() / 1000) - VENTANA_HORAS * 3600;

  const lista = await stripe.checkout.sessions.list(
    { created: { gte: desde }, limit: 100 },
    { stripeAccount: studio.stripe_account_id },
  );

  const sesiones: SesionCobrada[] = lista.data.map(s => ({
    id: s.id,
    status: s.status,
    paymentStatus: s.payment_status,
    metadata: s.metadata,
  }));

  // Qué está ya hecho, en DOS consultas y no una por sesión: los recibos que ya
  // constan cobrados, y los `rec-web-…` que ya existen (una compra de plan
  // entregada deja ese recibo, con id derivado de la sesión).
  const idsRecibo = sesiones.map(s => s.metadata?.reciboId).filter((x): x is string => !!x);
  const idsWeb = sesiones.map(s => idsDe(s.id).reciboId);

  const recibosCobrados = new Set<string>();
  if (idsRecibo.length) {
    const { data } = await admin
      .from('recibos').select('id').eq('studio_id', studio.id)
      .in('id', idsRecibo).eq('estado', 'COBRADO');
    for (const r of data ?? []) recibosCobrados.add((r as { id: string }).id);
  }

  const sesionesEntregadas = new Set<string>();
  if (idsWeb.length) {
    const { data } = await admin
      .from('recibos').select('id').eq('studio_id', studio.id).in('id', idsWeb);
    const existentes = new Set((data ?? []).map(r => (r as { id: string }).id));
    for (const s of sesiones) {
      if (existentes.has(idsDe(s.id).reciboId)) sesionesEntregadas.add(s.id);
    }
  }

  const pendientes = pendientesDeEntregar(sesiones, studio.id, { recibosCobrados, sesionesEntregadas });
  for (const p of pendientes) {
    await entregar(admin, stripe, studio.stripe_account_id, p, lista.data.find(s => s.id === p.sesionId));
  }
  return pendientes.length;
}

async function entregar(
  admin: SupabaseClient,
  stripe: Stripe,
  cuenta: string,
  p: Pendiente,
  sesion: Stripe.Checkout.Session | undefined,
) {
  // Que este barrido tenga trabajo significa que el webhook NO hizo el suyo.
  // Entregar en silencio arreglaría a la socia y escondería la avería, que es
  // exactamente cómo se llegó a perder el primer cobro.
  Sentry.captureMessage('[conciliador] cobro sin entregar recuperado', {
    level: 'warning',
    tags: { area: 'cobros', tipo: 'conciliado' },
    extra: { sesionId: p.sesionId, studioId: p.studioId, tipo: p.tipo },
  });

  if (p.tipo === 'recibo') {
    const { error } = await admin
      .from('recibos')
      .update({ estado: 'COBRADO', fecha_cobro: new Date().toISOString(), metodo_cobro: 'TARJETA' })
      .eq('id', p.reciboId).eq('studio_id', p.studioId)
      // Mismos estados cobrables que el webhook: nunca se resucita un DEVUELTO
      // ni se reescribe la fecha de uno ya COBRADO.
      .in('estado', ['PENDIENTE', 'FALLIDO', 'EN_CURSO']);
    if (error) throw new Error(`conciliador/recibo ${p.reciboId}: ${error.message}`);
    await aplicarRenovacionServidor(admin, { studioId: p.studioId, reciboId: p.reciboId });
    const { emitirPagoRealizado } = await import('@/lib/notifications/emit');
    await emitirPagoRealizado(admin, { studioId: p.studioId, reciboId: p.reciboId });
    const { enviarEmailReciboWebhook } = await import('@/lib/emails/enviar-recibo-webhook');
    await enviarEmailReciboWebhook(admin, { studioId: p.studioId, reciboId: p.reciboId });
    return;
  }

  const entrega = await entregarPlanComprado(admin, {
    sessionId: p.sesionId,
    studioId: p.studioId,
    planId: p.planId,
    socioId: p.socioId,
    email: sesion?.customer_details?.email ?? sesion?.customer_email ?? null,
    nombre: sesion?.customer_details?.name ?? null,
    // Lo cobrado de VERDAD, no el precio de catálogo de ahora: entre la compra
    // y este barrido el estudio puede haber cambiado el precio del plan.
    importeCobradoCentimos: typeof sesion?.amount_total === 'number' ? sesion.amount_total : null,
  });

  if (!entrega.ok) {
    Sentry.captureMessage('[conciliador] cobrado y NO se pudo entregar', {
      level: 'error',
      tags: { area: 'cobros', tipo: 'conciliado-fallido' },
      extra: { sesionId: p.sesionId, studioId: p.studioId, motivo: entrega.motivo, detalle: entrega.detalle },
    });
    return;
  }

  // Sin esto, la compra es invisible a reembolsos y disputas: sus manejadores
  // leen `pi.metadata.reciboId`, y el PaymentIntent de una compra de plan nace
  // sin metadata porque el recibo aún no existía. Mismo remate que el webhook.
  if (typeof sesion?.payment_intent === 'string') {
    try {
      await stripe.paymentIntents.update(
        sesion.payment_intent,
        { metadata: { reciboId: entrega.reciboId, origen: 'plan_web', studioId: p.studioId } },
        { stripeAccount: cuenta },
      );
    } catch { /* el bono ya está entregado; esto es el remate, no el cobro */ }
  }

  const { emitirPagoRealizado } = await import('@/lib/notifications/emit');
  await emitirPagoRealizado(admin, { studioId: p.studioId, reciboId: entrega.reciboId });
  const { enviarEmailReciboWebhook } = await import('@/lib/emails/enviar-recibo-webhook');
  await enviarEmailReciboWebhook(admin, { studioId: p.studioId, reciboId: entrega.reciboId });
}

export const conciliarCobrosDispatcher = inngest.createFunction(
  { id: 'conciliar-cobros', triggers: [{ cron: '*/5 * * * *' }] },
  async ({ step }) => {
    return step.run('conciliar', async () => {
      const key = process.env.STRIPE_SECRET_KEY;
      if (!key || key.startsWith('sk_test_XXXX')) return { skipped: 'stripe no configurado' };
      const admin = getSupabaseAdmin();
      if (!admin) return { skipped: 'sin service-role' };

      // Solo estudios que pueden cobrar. Hoy son un puñado; si algún día son
      // cientos, esto pasa a fan-out — pero no antes, que es cuando duele la
      // cuota de Inngest sin motivo.
      const { data: studios } = await admin
        .from('studios')
        .select('id, stripe_account_id')
        .not('stripe_account_id', 'is', null)
        .is('suspendido_en', null);
      if (!studios?.length) return { entregados: 0 };

      const stripe = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });
      let entregados = 0;
      for (const s of studios) {
        try {
          entregados += await conciliarEstudio(admin, stripe, s as { id: string; stripe_account_id: string });
        } catch (e) {
          // Un estudio que falle no puede dejar sin conciliar a los demás.
          Sentry.captureException(e instanceof Error ? e : new Error('conciliador'), {
            level: 'error', tags: { area: 'cobros' }, extra: { studioId: (s as { id: string }).id },
          });
        }
      }
      return { estudios: studios.length, entregados };
    });
  },
);
