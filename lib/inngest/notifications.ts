// ─────────────────────────────────────────────────────────────────────────────
// Notification Engine — worker de Inngest.
//
// Consume el evento único `notification/emit` y ejecuta el procesamiento del
// motor de forma asíncrona (fuera del hilo del request de negocio): resolver
// destinatarios → preferencias → escribir in-app + fan-out a canales. Con
// reintentos y concurrencia acotada, escala a miles de notificaciones diarias
// sin bloquear reservas ni cobros.
// ─────────────────────────────────────────────────────────────────────────────
import { inngest, EVENTS } from './client';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { procesarEvento } from '@/lib/notifications/engine';
import type { NotificationEvent } from '@/lib/notifications/types';

export const procesarNotificacion = inngest.createFunction(
  {
    id: 'notification-procesar',
    triggers: [{ event: EVENTS.NOTIFICATION_EMIT }],
    concurrency: { limit: 20 },
    retries: 3,
  },
  async ({ event, step }) => {
    const payload = event.data as unknown as NotificationEvent;
    return step.run('procesar', async () => {
      const admin = getSupabaseAdmin();
      if (!admin) return { skipped: 'sin service-role' };
      return procesarEvento(admin, payload);
    });
  },
);
