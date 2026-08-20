// Fase 1 · Dunning — barrido diario de reintentos de cobro.
//
// Mismo patrón durable que automatizaciones/decision (dispatcher cron → fan-out
// por estudio → un step.run durable por recibo). Cada día reintenta el cobro de
// los recibos PENDIENTE cuyo `proximo_reintento` ya venció. El cobro real y la
// progresión del ciclo (contar intento, reprogramar o marcar FALLIDO, notificar)
// se delegan en cobrarReciboOffSession + registrarFalloCobro, que también usa el
// webhook para las devoluciones SEPA — así tarjeta y SEPA siguen el mismo flujo.
import Stripe from 'stripe';
import * as Sentry from '@sentry/nextjs';
import { inngest, EVENTS, enviarFanOutEnLotes } from '@/lib/inngest/client';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { fetchAllRows } from '@/lib/supabase-data';
import { cobrarReciboOffSession } from '@/lib/billing/stripe-cobros';
import { registrarFalloCobro, confirmarCobroExitoso } from '@/lib/billing/dunning-server';
import { guardarCaducidadTarjeta } from '@/lib/billing/caducidad-tarjeta';

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
      // `suspendido_en`: un estudio suspendido no debe seguir persiguiendo
      // cobros de sus socias en su nombre.
      // Paginado: PostgREST corta a 1.000 filas en silencio, y aquí eso serían
      // estudios que dejan de perseguir sus cobros impagados sin avisar.
      const { data, error } = await fetchAllRows<{ id: string }>(
        '(global)', 'studios',
        (from, to) => admin
          .from('studios')
          .select('id')
          .not('stripe_account_id', 'is', null)
          .is('suspendido_en', null)
          .range(from, to),
      );
      if (error) throw new Error(error.message);
      return data;
    });

    await enviarFanOutEnLotes(step, 'fan-out-dunning', EVENTS.DUNNING_ESTUDIO, studios, (s: { id: string }) => ({ studioId: s.id, nowISO }));

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
        // Sin método guardado, cuenta no lista, no configurado, ya no pendiente
        // o ERROR_TRANSITORIO (D-5: red caída / 5xx de Stripe, desenlace del
        // cargo desconocido) → se omite (NO cuenta como intento). Que el
        // contador no avance es lo que hace SEGURO el siguiente barrido: repite
        // la MISMA Idempotency-Key (`-i{n}`) y Stripe deduplica — si el cargo
        // original entró y solo se perdió la respuesta, devuelve aquel
        // `succeeded` en vez de cobrar otra vez.
        return { tipo: 'omitido' as const, errorCode: cobro.errorCode };
      });

      if (res.tipo === 'cobro') { if (res.status === 'processing') enCurso++; else cobrados++; }
      else if (res.tipo === 'fallo') { if (res.estado === 'FALLIDO') fallidos++; else reprogramados++; }
      else omitidos++;
    }

    // Backstop de reconciliación SEPA: un recibo EN_CURSO espera al webhook
    // (payment_intent.succeeded/.payment_failed) para resolverse. Si esa
    // entrega nunca llega (Stripe agota sus reintentos, o un evento se
    // pierde), el recibo se quedaría EN_CURSO para siempre — nadie más lo
    // vuelve a mirar. 15 días naturales de margen sobre un adeudo SEPA que
    // normalmente falla en <14 días hábiles: no es el SLA real, es solo el
    // umbral de "esto ya no es normal, hay que preguntarle a Stripe".
    let sepaReconciliados = 0, sepaSiguenEnCurso = 0;
    const atascados = await step.run('sepa-atascado-candidatos', async () => {
      const key = process.env.STRIPE_SECRET_KEY;
      if (!key || key.startsWith('sk_test_XXXX')) return [];
      const admin = getSupabaseAdmin();
      if (!admin) throw new Error('Service role no configurada');
      const { data: studio } = await admin.from('studios').select('stripe_account_id').eq('id', studioId).maybeSingle();
      const stripeAccountId = (studio as { stripe_account_id: string | null } | null)?.stripe_account_id;
      if (!stripeAccountId) return [];
      const umbral = new Date(new Date(nowISO).getTime() - 15 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const { data, error } = await admin
        .from('recibos')
        .select('id, stripe_payment_intent_id')
        .eq('studio_id', studioId)
        .eq('estado', 'EN_CURSO')
        .not('stripe_payment_intent_id', 'is', null)
        .lte('fecha_vencimiento', umbral)
        .limit(50);
      if (error) throw new Error(error.message);
      return (data ?? []).map(r => ({ id: r.id as string, piId: r.stripe_payment_intent_id as string, stripeAccountId }));
    });

    for (const rec of atascados) {
      const res = await step.run(`sepa-reconciliar-${rec.id}`, async () => {
        const admin = getSupabaseAdmin();
        if (!admin) throw new Error('Service role no configurada');
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-06-24.dahlia' });
        const pi = await stripe.paymentIntents.retrieve(rec.piId, {}, { stripeAccount: rec.stripeAccountId });
        if (pi.status === 'processing') return { tipo: 'sigue_en_curso' as const };

        // El webhook no llegó a tiempo (o nunca) — misma lógica que él, para no
        // divergir de cómo se resuelve un cobro SEPA por la vía normal.
        Sentry.captureMessage('[dunning] reconciliación SEPA: webhook no resolvió el recibo, se actúa desde el backstop', {
          level: 'warning', tags: { area: 'cobros', tipo: 'reconciliacion' },
          extra: { reciboId: rec.id, studioId, paymentIntentId: pi.id, status: pi.status },
        });
        if (pi.status === 'succeeded') {
          const out = await confirmarCobroExitoso({ admin, reciboId: rec.id, studioId, metodo: 'SEPA' });
          return { tipo: 'reconciliado' as const, ok: out.ok };
        }
        // requires_payment_method / canceled / cualquier estado terminal no exitoso.
        await registrarFalloCobro({ admin, reciboId: rec.id, studioId, esSepa: true, ahoraISO: nowISO });
        return { tipo: 'reconciliado' as const, ok: true };
      });
      if (res.tipo === 'sigue_en_curso') sepaSiguenEnCurso++; else sepaReconciliados++;
    }

    // Relleno por goteo de la caducidad de las tarjetas (Fase 3 del Brain).
    //
    // Va AQUÍ y no en un cron propio por dos motivos: Inngest está al ~84% del
    // límite del plan free y no admite otro fan-out por estudio; y este worker
    // ya corre solo para los estudios con Stripe conectado y ya tiene el
    // `stripeAccount` a mano, que es justo lo que hace falta.
    //
    // Las tarjetas nuevas traen su caducidad desde el webhook; esto es solo
    // para las que se guardaron antes de que existieran esas columnas. Tope de
    // 25 por pasada: converge en unos días sin castigar la cuota de API de
    // Stripe, y cuando ya no queda ninguna el índice parcial hace que la
    // consulta no cueste nada.
    let caducidadesRellenadas = 0;
    const sinCaducidad = await step.run('tarjetas-sin-caducidad', async () => {
      const key = process.env.STRIPE_SECRET_KEY;
      if (!key || key.startsWith('sk_test_XXXX')) return [];
      const admin = getSupabaseAdmin();
      if (!admin) throw new Error('Service role no configurada');
      const { data: studio } = await admin.from('studios').select('stripe_account_id').eq('id', studioId).maybeSingle();
      const stripeAccountId = (studio as { stripe_account_id: string | null } | null)?.stripe_account_id;
      if (!stripeAccountId) return [];
      const { data, error } = await admin
        .from('socios')
        .select('id, stripe_payment_method_id')
        .eq('studio_id', studioId)
        .not('stripe_payment_method_id', 'is', null)
        .is('tarjeta_exp_anio', null)
        .is('borrado_en', null)
        .limit(25);
      if (error) throw new Error(error.message);
      return (data ?? []).map(r => ({ socioId: r.id as string, pmId: r.stripe_payment_method_id as string, stripeAccountId }));
    });

    for (const s of sinCaducidad) {
      // Un step por socia: idempotente y reanudable. `guardarCaducidadTarjeta`
      // no lanza nunca, así que una tarjeta que Stripe ya no reconoce (borrada,
      // cuenta desconectada) no puede tumbar el barrido de cobros de arriba.
      const ok = await step.run(`caducidad-${s.socioId}`, async () => {
        const admin = getSupabaseAdmin();
        if (!admin) throw new Error('Service role no configurada');
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-06-24.dahlia' });
        const r = await guardarCaducidadTarjeta(admin, stripe, {
          socioId: s.socioId, studioId, paymentMethodId: s.pmId, stripeAccount: s.stripeAccountId,
        });
        return r !== null;
      });
      if (ok) caducidadesRellenadas++;
    }

    return { studioId, candidatos: recibos.length, cobrados, enCurso, reprogramados, fallidos, omitidos, sepaReconciliados, sepaSiguenEnCurso, caducidadesRellenadas };
  },
);
