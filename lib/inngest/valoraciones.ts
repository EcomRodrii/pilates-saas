// Valoraciones — barrido que, tras cada clase, pide a las alumnas apuntadas que
// la valoren. Mismo patrón durable que dunning (dispatcher cron → fan-out por
// estudio → un step.run por clase). Idempotente: `sesiones.valoracion_pedida_en`
// se fija con compare-and-set ANTES de enviar, así una clase solo dispara una vez
// aunque el barrido se solape o reintente.
import { inngest, EVENTS } from '@/lib/inngest/client';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { firmarTokenValoracion } from '@/lib/valoraciones/token';
import { enviarEmailPedirValoracion } from '@/lib/valoraciones/email';

function cuandoTexto(inicio: string): string {
  const d = new Date(inicio);
  const fecha = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Madrid' });
  const hora = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
  return `${fecha.charAt(0).toUpperCase()}${fecha.slice(1)} · ${hora}`;
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
}

// Dispatcher: cada 6 h (a y 15 para no chocar con dunning 08:30 / decision 06:30·14:30
// / automatizaciones 07:00). Una clase recién terminada recibe la petición en <6 h.
export const valoracionesDispatcher = inngest.createFunction(
  { id: 'valoraciones-dispatcher', triggers: [{ cron: '15 */6 * * *' }] },
  async ({ step }) => {
    const nowISO = await step.run('now', async () => new Date().toISOString());

    const studios = await step.run('list-studios', async () => {
      const admin = getSupabaseAdmin();
      if (!admin) throw new Error('Service role no configurada');
      const { data, error } = await admin.from('studios').select('id');
      if (error) throw new Error(error.message);
      return data ?? [];
    });

    if (studios.length > 0) {
      await step.sendEvent(
        'fan-out-valoraciones',
        studios.map((s: { id: string }) => ({
          name: EVENTS.VALORACIONES_ESTUDIO,
          data: { studioId: s.id, nowISO },
        })),
      );
    }
    return { estudios: studios.length, ejecutadoEn: nowISO };
  },
);

// Worker: un run por estudio. Clases terminadas en las últimas 48 h sin petición
// enviada → una petición por alumna apuntada. Cada clase es idempotente.
export const procesarValoracionesEstudio = inngest.createFunction(
  {
    id: 'valoraciones-estudio',
    triggers: [{ event: EVENTS.VALORACIONES_ESTUDIO }],
    concurrency: { limit: 3 },
    retries: 3,
  },
  async ({ event, step }) => {
    const { studioId, nowISO } = event.data as { studioId: string; nowISO: string };
    const desdeISO = new Date(new Date(nowISO).getTime() - 48 * 60 * 60 * 1000).toISOString();

    const clases = await step.run('clases-terminadas', async () => {
      const admin = getSupabaseAdmin();
      if (!admin) throw new Error('Service role no configurada');
      const { data, error } = await admin
        .from('sesiones')
        .select('id, inicio, tipo_clase_id, instructor_id')
        .eq('studio_id', studioId)
        .eq('cancelada', false)
        .not('instructor_id', 'is', null)
        .is('valoracion_pedida_en', null)
        .lt('fin', nowISO)
        .gt('fin', desdeISO)
        .limit(200);
      if (error) throw new Error(error.message);
      return data ?? [];
    });

    let clasesPedidas = 0, emailsEnviados = 0;

    for (const c of clases as { id: string; inicio: string; tipo_clase_id: string | null; instructor_id: string }[]) {
      const res = await step.run(`pedir-${c.id}`, async () => {
        const admin = getSupabaseAdmin();
        if (!admin) throw new Error('Service role no configurada');

        // Compare-and-set: marca pedida ANTES de enviar. Si otra ejecución llegó
        // antes (0 filas), no reenvía.
        const { data: marcada } = await admin
          .from('sesiones')
          .update({ valoracion_pedida_en: nowISO })
          .eq('id', c.id).eq('studio_id', studioId).is('valoracion_pedida_en', null)
          .select('id');
        if (!marcada || marcada.length === 0) return { enviados: 0, pedida: false };

        const [{ data: tipo }, { data: instructora }, { data: estudio }] = await Promise.all([
          admin.from('tipos_clase').select('nombre').eq('id', c.tipo_clase_id ?? '').maybeSingle(),
          admin.from('instructores').select('nombre').eq('id', c.instructor_id).maybeSingle(),
          admin.from('studios').select('nombre').eq('id', studioId).maybeSingle(),
        ]);

        const { data: alumnas } = await admin.rpc('alumnas_apuntadas', { p_sesion_id: c.id });
        const lista = (alumnas ?? []) as { socio_id: string; nombre: string; email: string | null }[];

        let enviados = 0;
        for (const a of lista) {
          if (!a.email) continue;
          const token = firmarTokenValoracion(studioId, a.socio_id, c.id);
          const r = await enviarEmailPedirValoracion({
            to: a.email,
            toName: a.nombre,
            estudioNombre: estudio?.nombre ?? 'Tu estudio',
            claseNombre: tipo?.nombre ?? 'tu clase',
            cuando: cuandoTexto(c.inicio),
            instructorNombre: instructora?.nombre ?? '',
            url: `${appUrl()}/valorar/${token}`,
          });
          if ('ok' in r && r.ok) enviados++;
        }
        return { enviados, pedida: true };
      });
      if (res.pedida) clasesPedidas++;
      emailsEnviados += res.enviados;
    }

    return { studioId, clases: clases.length, clasesPedidas, emailsEnviados };
  },
);
