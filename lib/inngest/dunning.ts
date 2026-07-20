// Fase 1 · Dunning — barrido diario de reintentos de cobro.
//
// Mismo patrón durable que automatizaciones/decision (dispatcher cron → fan-out
// por estudio → un step.run durable por recibo). Cada día reintenta el cobro de
// los recibos PENDIENTE cuyo `proximo_reintento` ya venció. El cobro real y la
// progresión del ciclo (contar intento, reprogramar o marcar FALLIDO, notificar)
// se delegan en cobrarReciboOffSession + registrarFalloCobro, que también usa el
// webhook para las devoluciones SEPA — así tarjeta y SEPA siguen el mismo flujo.
import { inngest, EVENTS } from '@/lib/inngest/client';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { cobrarReciboOffSession } from '@/lib/billing/stripe-cobros';
import { registrarFalloCobro } from '@/lib/billing/dunning-server';

// Dispatcher: a las 08:30 UTC (evita las 07:00 de automatizaciones y las
// 06:30/14:30 del Decision OS, para no competir por la concurrencia del plan free).
export const dunningDispatcher = inngest.createFunction(
  { id: 'dunning-dispatcher', triggers: [{ cron: '30 8 * * *' }] },
  async ({ step }) => {
    const nowISO = await step.run('now', async () => new Date().toISOString());

    const studios = await step.run('list-studios', async () => {
      const admin = getSupabaseAdmin();
      if (!admin) throw new Error('Service role no configurada');
      // Solo estudios con Stripe conectado: sin cuenta conectada no hay cobro posible.
      const { data, error } = await admin
        .from('studios')
        .select('id')
        .not('stripe_account_id', 'is', null);
      if (error) throw new Error(error.message);
      return data ?? [];
    });

    if (studios.length > 0) {
      await step.sendEvent(
        'fan-out-dunning',
        studios.map((s: { id: string }) => ({
          name: EVENTS.DUNNING_ESTUDIO,
          data: { studioId: s.id, nowISO },
        })),
      );
    }

    return { estudios: studios.length, ejecutadoEn: nowISO };
  },
);

// Worker: un run por estudio. Cada recibo es un step.run durable e idempotente.
export const procesarDunningEstudio = inngest.createFunction(
  {
    id: 'dunning-estudio',
    triggers: [{ event: EVENTS.DUNNING_ESTUDIO }],
    concurrency: { limit: 3 }, // conservador dentro del máximo (5) del plan free
    retries: 3,
  },
  async ({ event, step }) => {
    const { studioId, nowISO } = event.data as { studioId: string; nowISO: string };

    const recibos = await step.run('candidatos', async () => {
      const admin = getSupabaseAdmin();
      if (!admin) throw new Error('Service role no configurada');
      const { data, error } = await admin
        .from('recibos')
        .select('id, socio_id')
        .eq('studio_id', studioId)
        .eq('estado', 'PENDIENTE')
        .not('socio_id', 'is', null)
        .not('proximo_reintento', 'is', null)
        .lte('proximo_reintento', nowISO)
        .limit(200);
      if (error) throw new Error(error.message);
      return data ?? [];
    });

    let cobrados = 0, enCurso = 0, reprogramados = 0, fallidos = 0, omitidos = 0;

    for (let i = 0; i < recibos.length; i++) {
      const r = recibos[i] as { id: string; socio_id: string };
      const res = await step.run(`dunning-${r.id}`, async () => {
        const cobro = await cobrarReciboOffSession({ reciboId: r.id, socioId: r.socio_id, studioId });
        if (cobro.ok) {
          // Tarjeta cobrada (succeeded) o adeudo SEPA enviado (processing → EN_CURSO,
          // se resolverá por webhook). No hay que avanzar el dunning aquí.
          return { tipo: 'cobro' as const, status: cobro.status };
        }
        // Rechazo real de cobro (tarjeta declinada / SEPA no iniciable) → avanza el ciclo.
        if (cobro.errorCode === 'FALLO_COBRO') {
          const admin = getSupabaseAdmin();
          if (!admin) throw new Error('Service role no configurada');
          const out = await registrarFalloCobro({ admin, reciboId: r.id, studioId, esSepa: false, ahoraISO: nowISO });
          return { tipo: 'fallo' as const, estado: out?.estado };
        }
        // Sin método guardado, cuenta no lista, no configurado o ya no pendiente →
        // se omite (NO cuenta como intento; se reintentará en el siguiente barrido).
        return { tipo: 'omitido' as const, errorCode: cobro.errorCode };
      });

      if (res.tipo === 'cobro') { if (res.status === 'processing') enCurso++; else cobrados++; }
      else if (res.tipo === 'fallo') { if (res.estado === 'FALLIDO') fallidos++; else reprogramados++; }
      else omitidos++;
    }

    return { studioId, candidatos: recibos.length, cobrados, enCurso, reprogramados, fallidos, omitidos };
  },
);
