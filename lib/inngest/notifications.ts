// ─────────────────────────────────────────────────────────────────────────────
// Notification Engine — worker de ENTREGA EXTERNA.
//
// La notificación in-app YA está escrita cuando esto corre: `publish()` la crea
// de forma síncrona, así que la campana no depende de esta cola. Aquí solo se
// entregan los canales lentos (push/email/WhatsApp/SMS) de notificaciones que ya
// existen en BD, con reintentos y concurrencia acotada.
//
// Se mantiene también el trigger antiguo (`notification/emit`) para consumir sin
// perder nada los eventos que quedaran encolados de la versión anterior.
// ─────────────────────────────────────────────────────────────────────────────
import { inngest, EVENTS } from './client';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { entregarExternos, procesarEvento } from '@/lib/notifications/process';
import type { NotificationEvent } from '@/lib/notifications/types';

export const procesarNotificacion = inngest.createFunction(
  {
    id: 'notification-procesar',
    triggers: [{ event: EVENTS.NOTIFICATION_DELIVER }, { event: EVENTS.NOTIFICATION_EMIT }],
    concurrency: { limit: 20 },
    retries: 3,
  },
  async ({ event, step }) => {
    return step.run('entregar', async () => {
      const admin = getSupabaseAdmin();
      if (!admin) return { skipped: 'sin service-role' };

      const data = event.data as Record<string, unknown>;
      // Camino nuevo: solo canales externos de notificaciones ya creadas.
      if (Array.isArray(data.notificationIds)) {
        return entregarExternos(admin, data.notificationIds as string[]);
      }
      // Camino antiguo (evento suelto en cola): procesar entero. Es idempotente
      // por dedup_key, así que no duplica lo que ya escribió publish().
      return procesarEvento(admin, data as unknown as NotificationEvent);
    });
  },
);
