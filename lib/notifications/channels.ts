// ─────────────────────────────────────────────────────────────────────────────
// Notification Engine — CANALES (server-only).
//
// Cada canal implementa la misma interfaz `Canal`. El motor no sabe nada del
// canal concreto: itera el registro. Añadir un canal (EMAIL/WHATSAPP/SMS) =
// añadir una entrada a CANALES envolviendo el wrapper que ya existe
// (lib/emails/send-server.ts, lib/twilio.ts) — sin tocar la lógica de negocio.
//
// Fase 1: INAPP (la fila ya materializada) + PUSH (stub que se completa en PR2).
// ─────────────────────────────────────────────────────────────────────────────
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DeliveryStatus, NotificationChannel, NotificationRow, Recipient } from './types.ts';

export interface ResultadoCanal {
  status: DeliveryStatus;
  providerId?: string;
  error?: string;
}

export interface Canal {
  nombre: NotificationChannel;
  enviar(ctx: {
    admin: SupabaseClient;
    notificacion: NotificationRow;
    destinatario: Recipient;
  }): Promise<ResultadoCanal>;
}

// INAPP: la propia fila `notification` ES la entrega dentro de la app. No hay
// nada externo que enviar; se marca SENT (la lee el centro de notificaciones).
const inapp: Canal = {
  nombre: 'INAPP',
  async enviar({ destinatario }) {
    // Sin cuenta reclamada no hay in-app posible (no puede iniciar sesión).
    if (!destinatario.userId) return { status: 'SKIPPED', error: 'destinatario sin cuenta' };
    return { status: 'SENT' };
  },
};

// PUSH (Web Push): envía a cada endpoint del usuario con web-push + VAPID. Sin
// VAPID o sin suscripción → SKIPPED (no es error, es que aún no aplica). Los
// endpoints caducados (404/410) se borran solos. web-push se importa perezoso
// para no cargarlo salvo cuando de verdad hay que enviar.
const push: Canal = {
  nombre: 'PUSH',
  async enviar({ admin, notificacion, destinatario }) {
    if (!destinatario.userId) return { status: 'SKIPPED', error: 'destinatario sin cuenta' };
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    if (!publicKey || !privateKey) return { status: 'SKIPPED', error: 'push no configurado (VAPID pendiente)' };

    const { data: subs } = await admin.from('push_subscription')
      .select('id, endpoint, p256dh, auth').eq('user_id', destinatario.userId);
    if (!subs || subs.length === 0) return { status: 'SKIPPED', error: 'sin suscripción push' };

    const webpush = (await import('web-push')).default;
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:soporte@tentare.app', publicKey, privateKey);
    const payload = JSON.stringify({
      title: notificacion.title, body: notificacion.body,
      url: notificacion.deepLink || '/', tag: notificacion.eventType,
    });

    let enviados = 0;
    let ultimoError: string | undefined;
    for (const s of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint as string, keys: { p256dh: s.p256dh as string, auth: s.auth as string } },
          payload,
        );
        enviados++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        // 404/410 = endpoint muerto (desinstaló la PWA / revocó) → limpiar.
        if (code === 404 || code === 410) await admin.from('push_subscription').delete().eq('id', s.id);
        else ultimoError = e instanceof Error ? e.message : 'error push';
      }
    }
    if (enviados > 0) return { status: 'SENT', providerId: `${enviados} endpoint(s)` };
    return { status: ultimoError ? 'FAILED' : 'SKIPPED', error: ultimoError ?? 'sin endpoints válidos' };
  },
};

export const CANALES: Record<NotificationChannel, Canal | undefined> = {
  INAPP: inapp,
  PUSH: push,
  EMAIL: undefined,     // PR3: envolver lib/emails/send-server.ts
  WHATSAPP: undefined,  // PR3: envolver lib/twilio.ts
  SMS: undefined,       // PR3: envolver lib/twilio.ts
};
