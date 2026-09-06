// Renovaciones de planes MENSUALES — generación del recibo en SERVIDOR.
//
// El recibo de renovación de una cuota mensual caducada se generaba en el
// NAVEGADOR (studio-context, al abrir el panel) y sin proximo_reintento, así
// que no entraba al barrido de dunning: si la propietaria no abría el panel no
// había recibo, y cuando lo había se cobraba a mano. Los bonos ya hacían esto
// bien (consumirBonoServidor genera su renovación con proximo_reintento); este
// cron iguala el mensual: cada día, para cada suscripción ACTIVA de plan
// MENSUAL con fecha_fin vencida y sin recibo de renovación pendiente, crea el
// recibo con proximo_reintento = ahora — el dunning de las 08:30 lo cobra
// off-session ese mismo día. El efecto del cliente sigue como fallback y
// dedupe contra estos mismos recibos.
//
// A las 08:00 UTC: antes del dunning (08:30) y fuera de las horas del resto de
// crons (07:00 automatizaciones, 06:30/14:30 Decision OS).
import { inngest, EVENTS, enviarFanOutEnLotes } from '@/lib/inngest/client';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { idsEstudios } from './estudios.ts';

export const renovacionesDispatcher = inngest.createFunction(
  { id: 'renovaciones-dispatcher', triggers: [{ cron: '0 8 * * *' }] },
  async ({ step }) => {
    const nowISO = await step.run('now', async () => new Date().toISOString());

    const studios = await step.run('list-studios', async () => {
      const admin = getSupabaseAdmin();
      if (!admin) throw new Error('Service role no configurada');
      // TODOS los estudios, tengan o no Stripe: el recibo debe existir también
      // para cobro manual — el dunning ya filtra por Stripe conectado al cobrar.
      // `suspendido_en`: un estudio suspendido no debe seguir generando
      // recibos de renovación en su nombre.
      return idsEstudios(admin);
    });

    await enviarFanOutEnLotes(step, 'fan-out-renovaciones', EVENTS.RENOVACIONES_ESTUDIO, studios, (s: { id: string }) => ({ studioId: s.id, nowISO }));

    return { estudios: studios.length, ejecutadoEn: nowISO };
  },
);

export const procesarRenovacionesEstudio = inngest.createFunction(
  {
    id: 'renovaciones-estudio',
    triggers: [{ event: EVENTS.RENOVACIONES_ESTUDIO }],
    concurrency: { limit: 3 },
    retries: 3,
  },
  async ({ event, step }) => {
    const { studioId, nowISO } = event.data as { studioId: string; nowISO: string };
    const hoy = nowISO.slice(0, 10);

    // Feature #5 (ficha Lorari-vs-Tentare): una socia sin tarjeta/SEPA guardados
    // (paga en efectivo/Bizum/transferencia a mano) nunca puede cobrarse
    // off-session — `elegirMetodoCobro` siempre devolvería SIN_METODO. Antes
    // esto SÍ entraba al dunning (proximo_reintento = ahora), y como el barrido
    // de dunning.ts nunca reprograma un "omitido" (solo avanza el ciclo en un
    // rechazo REAL), el mismo recibo se reintentaba cada día para siempre —
    // puro gasto de invocaciones en un plan de Inngest ya al ~84% de su límite
    // (ver inngest-limite-recordatorios-fan-out.md). El recibo se sigue
    // creando/adoptando igual (PENDIENTE, visible en /cobros para marcarlo a
    // mano), solo se le deja `proximo_reintento` en null para que el dunning
    // no lo vuelva a mirar.
    const idsConMetodoCobro = await step.run('socios-con-metodo-cobro', async () => {
      const admin = getSupabaseAdmin();
      if (!admin) throw new Error('Service role no configurada');
      const { data, error } = await admin
        .from('socios')
        .select('id')
        .eq('studio_id', studioId)
        .or('stripe_payment_method_id.not.is.null,sepa_payment_method_id.not.is.null');
      if (error) throw new Error(error.message);
      return (data ?? []).map(s => s.id as string);
    });
    // Set fuera del step: mismo motivo que ya documenta lib/inngest/decision.ts
    // para los Map — un tipo no plano devuelto por step.run se serializa a
    // `{}` en el replay de Inngest, así que se reconstruye siempre fuera.
    const conMetodoCobro = new Set(idsConMetodoCobro);

    // Adopción de recibos huérfanos: los de renovación generados por el
    // NAVEGADOR (efecto del studio-context, sin proximo_reintento) — incluidos
    // los que ya existen en prod de antes de este cron — no entraban nunca al
    // dunning. Se les programa el reintento para que el barrido los cobre —
    // salvo que la socia no tenga método off-session, ver guard de arriba.
    const adoptados = await step.run('adoptar-recibos-cliente', async () => {
      const admin = getSupabaseAdmin();
      if (!admin) throw new Error('Service role no configurada');
      const { data: candidatos, error: candErr } = await admin
        .from('recibos')
        .select('id, socio_id')
        .eq('studio_id', studioId)
        .eq('estado', 'PENDIENTE')
        .is('proximo_reintento', null)
        .not('suscripcion_id', 'is', null)
        // ⚠️ Por `es_renovacion`, NO por el texto del concepto. Este es el sitio
        // que decide A QUIEN SE LE COBRA SOLO, y hasta #1671 decidia por copy.
        // Su gemelo —`aplicarRenovacionServidor`, quien decide QUE SE ENTREGA—
        // ya migro a la columna, y la migracion 20260906003934 lo dice con
        // todas las letras: «una decision de dinero no puede depender de que
        // nadie lo traduzca ni lo reescriba». Quedaban divergentes: recepcion
        // crea desde /cobros un recibo con `suscripcion_id` (se adjunta solo la
        // suscripcion activa) y `es_renovacion: false` (el panel nunca lo
        // marca); si teclea el concepto «Renovacion Bono 10», el cron lo
        // adoptaba, el dunning le pasaba la tarjeta off-session y la entrega
        // devolvia SIN_ENTREGA. Cobro automatico real sin entregar nada.
        // El conjunto adoptado no cambia con los datos de hoy: la migracion
        // relleno `es_renovacion = true where concepto like 'Renovación%'`.
        .eq('es_renovacion', true)
        // ⚠️ D-3 (auditoría 24ª pasada): `/api/public/renovar-plan` crea un
        // recibo IDÉNTICO a este por convención (mismo id determinista
        // `rec-renov-{suscripcion}-{mes}`, para que choque por PK con el que
        // este mismo cron generaría) cuando la socia pulsa «Renovar» en el
        // portal — pero ESE es para pagarlo ELLA, ahora, con su propio
        // checkout. Sin este filtro, si cierra el checkout sin completarlo,
        // el barrido de MAÑANA lo adopta igual y el dunning de las 08:30 le
        // cobra la tarjeta guardada off-session sin que ella lo pidiera esta
        // vez. `checkout_session_id` se rellena en cuanto
        // app/api/stripe/checkout crea la sesión (antes de que pague o no),
        // así que es la señal de "esto lo está llevando ella en persona,
        // no lo adoptes" — sin inventar ninguna columna nueva.
        .is('checkout_session_id', null);
      if (candErr) throw new Error(candErr.message);
      const idsAAdoptar = (candidatos ?? [])
        .filter(r => conMetodoCobro.has(r.socio_id as string))
        .map(r => r.id as string);
      if (idsAAdoptar.length === 0) return 0;
      const { data, error } = await admin
        .from('recibos')
        .update({ proximo_reintento: nowISO })
        .in('id', idsAAdoptar)
        .select('id');
      if (error) throw new Error(error.message);
      return (data ?? []).length;
    });

    const generados = await step.run('generar-recibos', async () => {
      const admin = getSupabaseAdmin();
      if (!admin) throw new Error('Service role no configurada');

      const [{ data: susRows, error: susErr }, { data: planRows, error: planErr }] = await Promise.all([
        admin.from('suscripciones')
          .select('id, socio_id, plan_id, fecha_fin')
          .eq('studio_id', studioId)
          .eq('estado', 'ACTIVA')
          .not('fecha_fin', 'is', null)
          .lt('fecha_fin', hoy),
        admin.from('planes_tarifa')
          .select('id, nombre, precio, tipo')
          .eq('studio_id', studioId)
          .eq('tipo', 'MENSUAL'),
      ]);
      if (susErr) throw new Error(susErr.message);
      if (planErr) throw new Error(planErr.message);

      const planById = new Map((planRows ?? []).map(p => [p.id as string, p]));
      const vencidas = (susRows ?? []).filter(s => planById.has(s.plan_id as string));
      if (vencidas.length === 0) return 0;

      // Dedupe: fuera las suscripciones que ya tienen un recibo de renovación
      // en juego (PENDIENTE o adeudo EN_CURSO) — del cliente, de este cron ayer,
      // o creado a mano.
      const { data: pendientes, error: penErr } = await admin
        .from('recibos')
        .select('suscripcion_id')
        .eq('studio_id', studioId)
        .in('estado', ['PENDIENTE', 'EN_CURSO'])
        .in('suscripcion_id', vencidas.map(s => s.id as string));
      if (penErr) throw new Error(penErr.message);
      const conRecibo = new Set((pendientes ?? []).map(r => r.suscripcion_id as string));

      let creados = 0;
      for (const sus of vencidas) {
        if (conRecibo.has(sus.id as string)) continue;
        const plan = planById.get(sus.plan_id as string)!;
        // Id determinista por (suscripción, mes): un reintento del step o dos
        // ejecuciones el mismo día no duplican el recibo (choca por PK).
        const id = `rec-renov-${sus.id}-${hoy.slice(0, 7)}`;
        // Sin tarjeta/SEPA guardados no hay a quién cobrarle off-session — se
        // crea el recibo igual (para /cobros), pero sin entrar al dunning.
        const proximoReintento = conMetodoCobro.has(sus.socio_id as string) ? nowISO : null;
        const { error: insErr } = await admin.from('recibos').insert({
          id, studio_id: studioId, socio_id: sus.socio_id, suscripcion_id: sus.id,
          concepto: `Renovación ${plan.nombre}`, importe: plan.precio, estado: 'PENDIENTE',
          // Renueva un ciclo ya entregado: al cobrarlo hay que recargar/extender.
          es_renovacion: true,
          fecha_vencimiento: sus.fecha_fin, fecha_cobro: null, fecha_devolucion: null,
          intentos_reintento: 0, proximo_reintento: proximoReintento,
        });
        if (insErr) {
          // 23505 = ya existía (reintento del step): no es un fallo.
          if (insErr.code !== '23505') throw new Error(insErr.message);
          continue;
        }
        creados++;
      }
      return creados;
    });

    return { studioId, adoptados, generados };
  },
);
