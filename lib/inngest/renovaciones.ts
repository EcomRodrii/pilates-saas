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
import { inngest, EVENTS } from '@/lib/inngest/client';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';

export const renovacionesDispatcher = inngest.createFunction(
  { id: 'renovaciones-dispatcher', triggers: [{ cron: '0 8 * * *' }] },
  async ({ step }) => {
    const nowISO = await step.run('now', async () => new Date().toISOString());

    const studios = await step.run('list-studios', async () => {
      const admin = getSupabaseAdmin();
      if (!admin) throw new Error('Service role no configurada');
      // TODOS los estudios, tengan o no Stripe: el recibo debe existir también
      // para cobro manual — el dunning ya filtra por Stripe conectado al cobrar.
      const { data, error } = await admin.from('studios').select('id');
      if (error) throw new Error(error.message);
      return data ?? [];
    });

    if (studios.length > 0) {
      await step.sendEvent(
        'fan-out-renovaciones',
        studios.map((s: { id: string }) => ({
          name: EVENTS.RENOVACIONES_ESTUDIO,
          data: { studioId: s.id, nowISO },
        })),
      );
    }

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

    // Adopción de recibos huérfanos: los de renovación generados por el
    // NAVEGADOR (efecto del studio-context, sin proximo_reintento) — incluidos
    // los que ya existen en prod de antes de este cron — no entraban nunca al
    // dunning. Se les programa el reintento para que el barrido los cobre.
    const adoptados = await step.run('adoptar-recibos-cliente', async () => {
      const admin = getSupabaseAdmin();
      if (!admin) throw new Error('Service role no configurada');
      const { data, error } = await admin
        .from('recibos')
        .update({ proximo_reintento: nowISO })
        .eq('studio_id', studioId)
        .eq('estado', 'PENDIENTE')
        .is('proximo_reintento', null)
        .not('suscripcion_id', 'is', null)
        .like('concepto', 'Renovación%')
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
        const { error: insErr } = await admin.from('recibos').insert({
          id, studio_id: studioId, socio_id: sus.socio_id, suscripcion_id: sus.id,
          concepto: `Renovación ${plan.nombre}`, importe: plan.precio, estado: 'PENDIENTE',
          fecha_vencimiento: sus.fecha_fin, fecha_cobro: null, fecha_devolucion: null,
          intentos_reintento: 0, proximo_reintento: nowISO,
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
