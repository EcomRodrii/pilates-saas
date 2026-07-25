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
//   2. Entrega los canales EXTERNOS (push/email/WhatsApp/SMS) llamando a la ruta
//      interna /api/notifications/deliver. Tampoco pasa por la cola. Best-effort
//      y con timeout: si tarda o falla, la in-app ya está escrita.
//
// El PROCESAMIENTO de canales vive en process.ts (importa web-push → módulos de
// Node) y solo lo carga esa ruta; este módulo es alcanzable desde el bundle de
// cliente vía import dinámico, así que aquí NO se tocan los canales: el salto es
// un fetch a una URL, sin ningún import que arrastre Node al bundle.
// ─────────────────────────────────────────────────────────────────────────────
import type { SupabaseClient } from '@supabase/supabase-js';
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

  // 2) Canales externos (best-effort). Sin nada que entregar no se llama: la
  //    mayoría de eventos son solo in-app.
  if (paraEntregar.length === 0) return;
  await entregarExternos(paraEntregar);
}

// Salto HTTP interno a la ruta que sí puede cargar web-push. Con timeout, para
// que un push lento jamás alargue una reserva o un cobro.
async function entregarExternos(notificationIds: string[]): Promise<void> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('[notifications] CRON_SECRET ausente: no se entregan canales externos');
    return;
  }
  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://tentare.app';
  try {
    const res = await fetch(`${base}/api/notifications/deliver`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-notif-secret': secret },
      body: JSON.stringify({ notificationIds }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error('[notifications] entrega externa devolvió', res.status);
  } catch (e) {
    console.error('[notifications] entrega externa falló:', e instanceof Error ? e.message : e);
  }
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
  publish, marcarLeida, marcarNoLeida, marcarTodasLeidas, archivar,
};
