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
import { dunningPuedeCobrarPenalizacion, penalizacionDelRecibo } from '@/lib/billing/penalizacion-aprobar-reglas';
import {
  desprogramarReciboDePenalizacion, leerPenalizacionDelRecibo, seguirPenalizacionAlRecibo,
} from '@/lib/billing/penalizacion-recibo-server';

// Dispatcher: a las 08:30 UTC (evita las 07:00 de automatizaciones y las
// 14:30 del Decision OS, para no competir por la concurrencia del plan free).
export const dunningDispatcher = inngest.createFunction(
  { id: 'dunning-dispatcher', triggers: [{ cron: '30 8 * * *' }] },
  async ({ step }) => {
    // La hora va dentro del step de la lista, no en uno propio: cada step es una
    // ejecución de Inngest, y el valor sigue siendo el mismo en los replays.
    // Id nuevo a propósito: el step devuelve otra forma ({ nowISO, studios }), y
    // con el id viejo una ejecución a medias durante un despliegue recuperaría el
    // array guardado y el fan-out fallaría para todos los estudios.
    const { nowISO, studios } = await step.run('list-studios-con-hora', async () => {
      const nowISO = new Date().toISOString();
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
      return { nowISO, studios: data };
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

    // Las tres lecturas fijas del barrido van en UN step (antes tres): cada step es
    // una ejecución de Inngest, y estas solo leen, así que repetirlas en un
    // reintento no tiene efectos. Leer los SEPA atascados y las tarjetas sin
    // caducidad ANTES del bucle de cobro no cambia qué se hace: un adeudo enviado en
    // este mismo barrido vuelve de Stripe como `processing`, que ya era un no-op en
    // el backstop, y cobrar no toca la caducidad de ninguna tarjeta.
    type Atascado = { id: string; piId: string; stripeAccountId: string };
    type SinCaducidad = { socioId: string; pmId: string; stripeAccountId: string };
    const { recibos, atascados, sinCaducidad } = await step.run('lecturas', async () => {
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
      const recibos = data ?? [];
      const sinStripe = { recibos, atascados: [] as Atascado[], sinCaducidad: [] as SinCaducidad[] };

      // Lo que sigue pregunta a Stripe: sin clave o sin cuenta conectada, nada.
      const key = process.env.STRIPE_SECRET_KEY;
      if (!key || key.startsWith('sk_test_XXXX')) return sinStripe;
      const { data: studio } = await admin.from('studios').select('stripe_account_id').eq('id', studioId).maybeSingle();
      const stripeAccountId = (studio as { stripe_account_id: string | null } | null)?.stripe_account_id;
      if (!stripeAccountId) return sinStripe;

      // Las dos lecturas que siguen son secundarias y se repiten mañana. Si fallan
      // (un 504 de PostgREST a esta hora, por ejemplo) NO pueden tumbar el step:
      // detrás vienen los cobros del día, que antes no dependían de ellas. Se
      // avisa y se sigue sin ellas.
      const aviso = (que: string, e: unknown) => Sentry.captureMessage(`[dunning] no se pudo leer ${que}; se reintenta mañana`, {
        level: 'warning', tags: { area: 'cobros', tipo: 'dunning' },
        extra: { studioId, error: e instanceof Error ? e.message : String(e) },
      });

      // Backstop SEPA (ver el bucle de más abajo): EN_CURSO desde hace más de 15 días.
      let atascados: Atascado[] = [];
      try {
        const umbral = new Date(new Date(nowISO).getTime() - 15 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const { data: enCursoViejos, error: errAtascados } = await admin
          .from('recibos')
          .select('id, stripe_payment_intent_id')
          .eq('studio_id', studioId)
          .eq('estado', 'EN_CURSO')
          .not('stripe_payment_intent_id', 'is', null)
          .lte('fecha_vencimiento', umbral)
          .limit(50);
        if (errAtascados) throw new Error(errAtascados.message);
        atascados = (enCursoViejos ?? []).map(r => ({ id: r.id as string, piId: r.stripe_payment_intent_id as string, stripeAccountId }));
      } catch (e) {
        aviso('los adeudos SEPA atascados', e);
      }

      // Relleno de caducidades (ver el step `caducidades`).
      let sinCaducidad: SinCaducidad[] = [];
      try {
        const { data: tarjetas, error: errTarjetas } = await admin
          .from('socios')
          .select('id, stripe_payment_method_id')
          .eq('studio_id', studioId)
          .not('stripe_payment_method_id', 'is', null)
          .is('tarjeta_exp_anio', null)
          // Un Link no tiene caducidad, y sin esto se volvería a pedir a Stripe
          // cada día, para siempre (y 25 así taparían el relleno de las tarjetas).
          // `.or` y no `.neq` a secas: `neq` excluiría también las `tarjeta_marca`
          // NULL, que son justo las tarjetas viejas por rellenar.
          .or('tarjeta_marca.is.null,tarjeta_marca.neq.link')
          .is('borrado_en', null)
          .limit(25);
        if (errTarjetas) throw new Error(errTarjetas.message);
        sinCaducidad = (tarjetas ?? []).map(r => ({ socioId: r.id as string, pmId: r.stripe_payment_method_id as string, stripeAccountId }));
      } catch (e) {
        aviso('las tarjetas sin caducidad', e);
      }

      return { recibos, atascados, sinCaducidad };
    });

    let cobrados = 0, enCurso = 0, reprogramados = 0, fallidos = 0, omitidos = 0;

    for (let i = 0; i < recibos.length; i++) {
      const r = recibos[i] as { id: string; socio_id: string };
      const esDePenalizacion = penalizacionDelRecibo(r.id) !== null;
      const res = await step.run(`dunning-${r.id}`, async () => {
        // El recibo de una penalización solo se cobra con el cobro ya decidido
        // (`dunningPuedeCobrarPenalizacion`). Uno armado de otra forma (código
        // anterior, un desarme que no se pudo confirmar) tendría detrás una
        // penalización que el trigger de no-show puede revertir, que espera al
        // estudio o que se decidió no cobrar. Se omite sin contar intento y, con
        // la penalización leída, se saca del dunning para que el aviso salga
        // una vez y no cada día.
        if (esDePenalizacion) {
          const admin = getSupabaseAdmin();
          if (!admin) throw new Error('Service role no configurada');
          const pen = await leerPenalizacionDelRecibo(admin, { studioId, reciboId: r.id });
          if (!dunningPuedeCobrarPenalizacion(pen)) {
            const desprogramado = pen.ok ? await desprogramarReciboDePenalizacion(admin, { studioId, reciboId: r.id, hastaISO: nowISO }) : false;
            Sentry.captureMessage('[dunning] recibo de penalización sin cobro decidido: no se cobra', {
              level: 'warning', tags: { area: 'cobros', tipo: 'dunning' },
              extra: { reciboId: r.id, studioId, estadoPenalizacion: pen.ok ? pen.estado : 'ilegible', desprogramado },
            });
            return { tipo: 'omitido' as const, errorCode: 'PENALIZACION_SIN_COBRO_DECIDIDO' as const };
          }
        }
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

      // Su penalización refleja cómo ha quedado el recibo (cobrado → COBRADA,
      // agotado → FALLIDA, con aviso de pago deduplicado). En un step aparte: si
      // el proceso muere aquí, Inngest repite esto y no el cobro. Se lee el
      // estado del recibo, no `res`, así que también cubre la excepción que llega
      // DESPUÉS de un cargo que sí entró. Lo que no se escriba lo barre el cron.
      if (esDePenalizacion && !(res.tipo === 'omitido' && res.errorCode === 'PENALIZACION_SIN_COBRO_DECIDIDO')) {
        await step.run(`dunning-penalizacion-${r.id}`, async () => {
          const admin = getSupabaseAdmin();
          if (!admin) throw new Error('Service role no configurada');
          const seguimiento = await seguirPenalizacionAlRecibo(admin, { studioId, reciboId: r.id });
          return seguimiento?.paso ?? null;
        });
      }

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
    // Cada recibo atascado sigue en su propio step: aquí sí se mueve dinero.
    let sepaReconciliados = 0, sepaSiguenEnCurso = 0;
    for (const rec of atascados) {
      const res = await step.run(`sepa-reconciliar-${rec.id}`, async () => {
        const admin = getSupabaseAdmin();
        if (!admin) throw new Error('Service role no configurada');
        // Se relee el recibo antes de actuar: entre la lectura del principio y este
        // step puede pasar el bucle de cobros entero, y si en ese rato el webhook ya
        // lo resolvió, actuar otra vez sumaría un intento de más en
        // registrarFalloCobro (reintento perdido, FALLIDO antes de tiempo, doble aviso).
        const { data: actual, error: errActual } = await admin.from('recibos')
          .select('estado, stripe_payment_intent_id').eq('id', rec.id).eq('studio_id', studioId).maybeSingle();
        if (errActual) throw new Error(errActual.message);
        if (actual?.estado !== 'EN_CURSO' || actual.stripe_payment_intent_id !== rec.piId) {
          return { tipo: 'ya_resuelto' as const };
        }
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
          const out = await confirmarCobroExitoso({ admin, reciboId: rec.id, studioId, metodo: 'SEPA', fuente: 'conciliador' });
          return { tipo: 'reconciliado' as const, ok: out.ok };
        }
        // requires_payment_method / canceled / cualquier estado terminal no exitoso.
        await registrarFalloCobro({ admin, reciboId: rec.id, studioId, esSepa: true, ahoraISO: nowISO });
        return { tipo: 'reconciliado' as const, ok: true };
      });
      if (res.tipo === 'sigue_en_curso') sepaSiguenEnCurso++;
      else if (res.tipo === 'reconciliado') sepaReconciliados++;
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
    //
    // Las hasta 25 tarjetas van en UN step (antes uno por tarjeta), y sin
    // tarjetas no se gasta ninguno. `guardarCaducidadTarjeta` no lanza nunca y es
    // idempotente: repetir el lote en un reintento solo vuelve a escribir la misma
    // caducidad, y una tarjeta que Stripe ya no reconoce (borrada, cuenta
    // desconectada) no puede tumbar el barrido de cobros de arriba.
    const caducidadesRellenadas = sinCaducidad.length === 0 ? 0 : await step.run('caducidades', async () => {
      const admin = getSupabaseAdmin();
      if (!admin) throw new Error('Service role no configurada');
      // Timeout corto y sin reintentos de red: con el de serie (80 s por llamada)
      // 25 tarjetas con Stripe lento pasarían del límite de 300 s de la función.
      // Una que no responda se rellena mañana.
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-06-24.dahlia', timeout: 8_000, maxNetworkRetries: 0 });
      let rellenadas = 0;
      for (const s of sinCaducidad) {
        const r = await guardarCaducidadTarjeta(admin, stripe, {
          socioId: s.socioId, studioId, paymentMethodId: s.pmId, stripeAccount: s.stripeAccountId,
        });
        if (r !== null) rellenadas++;
      }
      return rellenadas;
    });

    return { studioId, candidatos: recibos.length, cobrados, enCurso, reprogramados, fallidos, omitidos, sepaReconciliados, sepaSiguenEnCurso, caducidadesRellenadas };
  },
);
