// ─────────────────────────────────────────────────────────────────────────────
// Notification Engine — API pública (server, pero SIN canales).
//
// Los módulos de negocio SOLO llaman a NotificationEngine.publish(evento).
//
// publish() hace DOS cosas, en este orden y con esta garantía:
//   1. Escribe la notificación IN-APP en el acto (INSERT síncrono). NO depende de
//      la cola: si Inngest está caído o mal configurado, la campana igual se
//      entera. Esto es a propósito — una cola invisible que falla en silencio nos
//      dejó sin ninguna notificación en producción.
//   2. Encola los canales EXTERNOS (push/email/WhatsApp/SMS) en Inngest, que sí
//      son lentos y necesitan reintentos. Best-effort: si falla, la in-app ya está.
//
// El PROCESAMIENTO de canales vive en process.ts (importa web-push → módulos de
// Node) y solo lo carga el worker; este módulo es alcanzable desde el bundle de
// cliente vía import dinámico, así que aquí NO se tocan los canales.
// ─────────────────────────────────────────────────────────────────────────────
import type { SupabaseClient } from '@supabase/supabase-js';
import { inngest, EVENTS } from '../inngest/client.ts';
import { getSupabaseAdmin } from '../db/supabase-admin.ts';
import { REGLAS } from './catalog.ts';
import { crearInApp } from './inapp.ts';
import type { NotificationEvent } from './types.ts';

// Publica un evento. Nunca propaga errores: una notificación no puede tumbar una
// reserva ni un cobro.
export async function publish(event: NotificationEvent): Promise<void> {
  if (!REGLAS[event.type]) {
    console.warn('[notifications] evento sin regla, ignorado:', event.type);
    return;
  }

  // 1) In-app SÍNCRONO (garantizado).
  let paraEntregar: string[] = [];
  try {
    const admin = getSupabaseAdmin();
    if (!admin) {
      console.error('[notifications] sin service-role: no se puede crear la notificación');
      return;
    }
    const { creadas } = await crearInApp(admin, event);
    paraEntregar = creadas.filter(c => c.canalesExtra.length > 0).map(c => c.id);
  } catch (e) {
    console.error('[notifications] crear in-app falló:', e instanceof Error ? e.message : e);
    return;
  }

  // 2) Canales externos por la cola (best-effort). Sin nada que entregar, ni se
  //    encola: la mayoría de eventos son solo in-app.
  if (paraEntregar.length === 0) return;
  try {
    await inngest.send({
      name: EVENTS.NOTIFICATION_DELIVER,
      data: { notificationIds: paraEntregar },
    });
  } catch (e) {
    console.error('[notifications] no se pudo encolar la entrega externa:', e instanceof Error ? e.message : e);
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
