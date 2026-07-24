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

// PUSH: stub de Fase 1. Busca suscripción del usuario; sin VAPID configurado o
// sin suscripción → SKIPPED (no es un error, es que aún no aplica). El envío real
// (web-push + VAPID + service worker) llega en el PR2.
const push: Canal = {
  nombre: 'PUSH',
  async enviar({ admin, destinatario }) {
    if (!destinatario.userId) return { status: 'SKIPPED', error: 'destinatario sin cuenta' };
    if (!process.env.VAPID_PRIVATE_KEY || !process.env.VAPID_PUBLIC_KEY) {
      return { status: 'SKIPPED', error: 'push no configurado (VAPID pendiente)' };
    }
    const { data } = await admin.from('push_subscription')
      .select('id').eq('user_id', destinatario.userId).limit(1);
    if (!data || data.length === 0) return { status: 'SKIPPED', error: 'sin suscripción push' };
    // PR2: enviar con web-push a cada endpoint. De momento no bloquea nada.
    return { status: 'SKIPPED', error: 'envío push pendiente (PR2)' };
  },
};

export const CANALES: Record<NotificationChannel, Canal | undefined> = {
  INAPP: inapp,
  PUSH: push,
  EMAIL: undefined,     // PR3: envolver lib/emails/send-server.ts
  WHATSAPP: undefined,  // PR3: envolver lib/twilio.ts
  SMS: undefined,       // PR3: envolver lib/twilio.ts
};
