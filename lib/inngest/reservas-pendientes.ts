// ─────────────────────────────────────────────────────────────────────────────
// Fase 2a (aprobación manual de reserva): ninguna reserva puede seguir
// PENDIENTE_APROBACION una vez empezada su clase. La regla de negocio en sí
// vive en la RPC `resolver_reserva_pendiente` (una aprobación tardía siempre
// vuelve CANCELADA, pase lo que pase con este cron) — este cron es solo el
// aviso proactivo a la socia, por eso corre cada minuto y no cada 15 min como
// el resto de crons de notificaciones: el desfase debe ser mínimo.
//
// Sin fan-out por estudio (a diferencia de notif-automations.ts): es una
// única query global de "sesión ya empezada", no hay nada que decidir por
// estudio.
// ─────────────────────────────────────────────────────────────────────────────
import { inngest } from './client';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { expirarReservaPendiente } from '@/lib/db/supabase-data-admin';

export const expirarReservasPendientesDispatcher = inngest.createFunction(
  { id: 'reservas-pendientes-expirar', triggers: [{ cron: '* * * * *' }] },
  async ({ step }) => {
    return step.run('expirar', async () => {
      const admin = getSupabaseAdmin();
      if (!admin) return { skipped: 'sin service-role' };
      const { data: reservas } = await admin
        .from('reservas')
        .select('id, studio_id, sesion_id, socio_id')
        .eq('estado', 'PENDIENTE_APROBACION');
      if (!reservas?.length) return { expiradas: 0 };
      const { data: sesiones } = await admin
        .from('sesiones')
        .select('id, inicio')
        .in('id', [...new Set(reservas.map((r) => r.sesion_id as string))]);
      const inicioById = new Map((sesiones ?? []).map((s) => [s.id as string, s.inicio as string]));
      const ahora = Date.now();
      let expiradas = 0;
      for (const r of reservas) {
        if (!r.socio_id) continue;
        const inicio = inicioById.get(r.sesion_id as string);
        if (!inicio || new Date(inicio).getTime() > ahora) continue;
        await expirarReservaPendiente({
          studioId: r.studio_id as string,
          reservaId: r.id as string,
          sesionId: r.sesion_id as string,
          socioId: r.socio_id as string,
        });
        expiradas++;
      }
      return { expiradas };
    });
  },
);
