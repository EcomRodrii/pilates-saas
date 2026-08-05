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
import { crearInApp, type NotificacionCreada } from './inapp.ts';
import type { NotificationEvent } from './types.ts';

// Publica un evento. Nunca propaga errores: una notificación no puede tumbar una
// reserva ni un cobro.
//
// Devuelve QUÉ se creó realmente (lista vacía si no se creó nada). Casi todas las
// llamadas lo ignoran —son fuego y olvido—, pero cuando la dueña pulsa "Sí,
// avisar" hay que poder decirle a cuántas personas ha avisado de verdad en vez de
// dar por hecho que fueron las que el panel creía ver.
export async function publish(event: NotificationEvent): Promise<NotificacionCreada[]> {
  if (!REGLAS[event.type]) {
    console.warn('[notifications] evento sin regla, ignorado:', event.type);
    return [];
  }

  // 1) In-app SÍNCRONO (garantizado).
  let creadas: NotificacionCreada[] = [];
  try {
    const admin = getSupabaseAdmin();
    if (!admin) {
      console.error('[notifications] sin service-role: no se puede crear la notificación');
      return [];
    }
    ({ creadas } = await crearInApp(admin, event));
  } catch (e) {
    console.error('[notifications] crear in-app falló:', e instanceof Error ? e.message : e);
    return [];
  }

  // 2) Canales externos (best-effort). Sin nada que entregar no se llama: la
  //    mayoría de eventos son solo in-app.
  const paraEntregar = creadas.filter(c => c.canalesExtra.length > 0).map(c => c.id);
  if (paraEntregar.length > 0) await entregarExternos(paraEntregar);
  return creadas;
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
// El comentario que había aquí decía "RLS garantiza que solo toca lo suyo" —
// falso: `notification_update` (migración 0092) autoriza el UPDATE también con
// `studio_id = current_studio_id()`, así que CUALQUIER staff del estudio podía
// marcar leída/archivar la notificación de OTRA persona (p. ej. una instructora
// archivando el aviso de pago fallido de la propietaria). Hoy no hay ninguna
// ruta que llame a estas tres sin acotar por destinatario (el único camino real,
// app/api/notifications/route.ts PATCH, ya filtra bien con service-role), pero
// dejarlas así era una trampa para el próximo que las reutilizara confiando en
// el comentario. Se exige userId y se filtra explícitamente.
//
// ⚠️ Y ahora `recipient_user_id` a secas tampoco basta, por lo que aprendió el
// PATCH de esa misma ruta: una persona puede ser staff Y socia del mismo estudio
// con la misma cuenta (en prod hay una), así que estas cuatro tocan hoy avisos
// de ambas superficies a la vez — que es justo lo que `lib/notifications/
// ambito.ts` vino a separar. Siguen sin llamador, pero siguen exportadas en
// `NotificationEngine`: quien las enchufe tiene que pasarles también el ámbito
// (`filtroDeAmbito`), o reabre el bug de aislamiento por el camino de al lado.

export async function marcarLeida(supa: SupabaseClient, notificationId: string, userId: string): Promise<void> {
  await supa.from('notification').update({ read_at: new Date().toISOString() })
    .eq('id', notificationId).eq('recipient_user_id', userId).is('read_at', null);
}

export async function marcarNoLeida(supa: SupabaseClient, notificationId: string, userId: string): Promise<void> {
  await supa.from('notification').update({ read_at: null })
    .eq('id', notificationId).eq('recipient_user_id', userId);
}

export async function marcarTodasLeidas(supa: SupabaseClient, userId: string): Promise<void> {
  await supa.from('notification').update({ read_at: new Date().toISOString() })
    .eq('recipient_user_id', userId).is('read_at', null);
}

export async function archivar(supa: SupabaseClient, notificationId: string, userId: string): Promise<void> {
  await supa.from('notification').update({ archived_at: new Date().toISOString() })
    .eq('id', notificationId).eq('recipient_user_id', userId);
}

export const NotificationEngine = {
  publish, marcarLeida, marcarNoLeida, marcarTodasLeidas, archivar,
};
