// ─────────────────────────────────────────────────────────────────────────────
// Fase 2a (aprobación manual de reserva): ninguna reserva puede seguir
// PENDIENTE_APROBACION una vez empezada su clase. La regla de negocio en sí
// vive en la RPC `resolver_reserva_pendiente` (una aprobación tardía siempre
// vuelve CANCELADA, pase lo que pase con este cron) — este cron es solo el
// aviso proactivo a la socia.
//
// Cada 5 min, no cada minuto. Corría cada minuto para que el desfase del aviso
// fuera mínimo, pero eso son 43.800 tics al mes y, contando el step de Inngest
// como invocación propia, ~87.600 invocaciones de Vercel: el 70 % de todas las
// que generan los crons de este repo, para una tabla en la que casi siempre no
// hay nada que expirar. Lo que se paga con el cambio es que el aviso puede
// llegar hasta 4 minutos más tarde; lo que NO cambia es la corrección, porque
// la guardia de "clase ya empezada" está dentro de la RPC y no depende de que
// este cron llegue a tiempo ni de que llegue siquiera.
//
// Sin fan-out por estudio (a diferencia de notif-automations.ts): es una
// única query global de "sesión ya empezada", no hay nada que decidir por
// estudio.
// ─────────────────────────────────────────────────────────────────────────────
import { inngest } from './client';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { expirarReservaPendiente } from '@/lib/db/supabase-data-admin';
import { fetchAllRows } from '@/lib/supabase-data';

export const expirarReservasPendientesDispatcher = inngest.createFunction(
  { id: 'reservas-pendientes-expirar', triggers: [{ cron: '*/5 * * * *' }] },
  async ({ step }) => {
    return step.run('expirar', async () => {
      const admin = getSupabaseAdmin();
      if (!admin) return { skipped: 'sin service-role' };
      // Paginado: query global (todos los estudios) y PostgREST corta a 1.000
      // filas en silencio. La corrección no depende de este cron (la guardia
      // está en la RPC), pero el AVISO a la socia sí: una reserva truncada se
      // queda sin él y la socia no se entera de que su plaza decayó.
      const { data: reservas } = await fetchAllRows<{ id: string; studio_id: string; sesion_id: string; socio_id: string | null }>(
        '(global)', 'reservas',
        (from, to) => admin
          .from('reservas')
          .select('id, studio_id, sesion_id, socio_id')
          .eq('estado', 'PENDIENTE_APROBACION')
          .range(from, to),
      );
      if (!reservas.length) return { expiradas: 0 };
      const { data: sesiones } = await fetchAllRows<{ id: string; inicio: string }>(
        '(global)', 'sesiones',
        (from, to) => admin
          .from('sesiones')
          .select('id, inicio')
          .in('id', [...new Set(reservas.map((r) => r.sesion_id))])
          .range(from, to),
      );
      const inicioById = new Map(sesiones.map((s) => [s.id, s.inicio]));
      const ahora = Date.now();
      let expiradas = 0;
      for (const r of reservas) {
        if (!r.socio_id) continue;
        const inicio = inicioById.get(r.sesion_id);
        if (!inicio || new Date(inicio).getTime() > ahora) continue;
        await expirarReservaPendiente({
          studioId: r.studio_id,
          reservaId: r.id,
          sesionId: r.sesion_id,
          socioId: r.socio_id,
        });
        expiradas++;
      }
      return { expiradas };
    });
  },
);
