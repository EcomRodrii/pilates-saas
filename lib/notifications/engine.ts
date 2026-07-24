// ─────────────────────────────────────────────────────────────────────────────
// Notification Engine — API pública (server, pero SIN canales).
//
// Los módulos de negocio SOLO llaman a NotificationEngine.publish(evento): encola
// en Inngest y jamás rompe el flujo. El PROCESAMIENTO (que toca los canales, y
// con ellos web-push / módulos de Node) vive en process.ts, que solo importa el
// worker de Inngest — así este módulo, alcanzable por import dinámico desde
// código que también corre en el navegador, no arrastra web-push al cliente.
// ─────────────────────────────────────────────────────────────────────────────
import type { SupabaseClient } from '@supabase/supabase-js';
import { inngest, EVENTS } from '../inngest/client.ts';
import { REGLAS } from './catalog.ts';
import type { NotificationEvent } from './types.ts';

// Publica un evento. No espera al envío ni propaga errores.
export async function publish(event: NotificationEvent): Promise<void> {
  try {
    if (!REGLAS[event.type]) {
      console.warn('[notifications] evento sin regla, ignorado:', event.type);
      return;
    }
    await inngest.send({ name: EVENTS.NOTIFICATION_EMIT, data: event as unknown as Record<string, unknown> });
  } catch (e) {
    console.error('[notifications] publish falló:', e instanceof Error ? e.message : e);
  }
}

// Programa un evento para el futuro (delega en Inngest).
export async function schedule(event: NotificationEvent, whenISO: string): Promise<void> {
  await publish({ ...event, scheduledFor: whenISO });
}

// ── Acciones sobre notificaciones ya creadas (las llaman las rutas API) ──────────
// Usan el cliente de sesión del usuario → RLS garantiza que solo toca lo suyo.

export async function marcarLeida(supa: SupabaseClient, notificationId: string): Promise<void> {
  await supa.from('notification').update({ read_at: new Date().toISOString() }).eq('id', notificationId).is('read_at', null);
}

export async function marcarNoLeida(supa: SupabaseClient, notificationId: string): Promise<void> {
  await supa.from('notification').update({ read_at: null }).eq('id', notificationId);
}

export async function marcarTodasLeidas(supa: SupabaseClient, userId: string): Promise<void> {
  await supa.from('notification').update({ read_at: new Date().toISOString() })
    .eq('recipient_user_id', userId).is('read_at', null);
}

export async function archivar(supa: SupabaseClient, notificationId: string): Promise<void> {
  await supa.from('notification').update({ archived_at: new Date().toISOString() }).eq('id', notificationId);
}

export const NotificationEngine = {
  publish, schedule, marcarLeida, marcarNoLeida, marcarTodasLeidas, archivar,
};
