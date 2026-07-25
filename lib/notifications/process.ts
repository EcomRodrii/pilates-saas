// ─────────────────────────────────────────────────────────────────────────────
// Notification Engine — PROCESAMIENTO (server-only, node runtime).
//
// Aislado a propósito de engine.ts: aquí viven los CANALES (que importan
// web-push → módulos de Node como `net`). engine.ts (publish) es alcanzable
// desde módulos que también corren en el navegador (supabase-data vía import
// dinámico), así que NO debe arrastrar los canales al bundle de cliente. Este
// módulo solo lo importa el worker de Inngest (server).
// ─────────────────────────────────────────────────────────────────────────────
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '../db/supabase-admin.ts';
import { REGLAS } from './catalog.ts';
import { CANALES } from './channels.ts';
import { crearInApp, canalesExtraDe, preferenciaDe, PREF_DEFECTO, type Preferencia } from './inapp.ts';
import type {
  NotificationCategory, NotificationChannel, NotificationEvent, NotificationRow, Recipient,
} from './types.ts';

// Preferencia/PREF_DEFECTO/canalesExtraDe/preferenciaDe viven en inapp.ts (que
// no importa canales) y se re-exportan aquí por compatibilidad.
export { canalesExtraDe, preferenciaDe, PREF_DEFECTO };
export type { Preferencia };

export interface ResultadoProceso { creadas: number; deliveries: number; omitidas: number; }

// Camino COMPLETO (in-app + canales) en una sola llamada. Ya no es el camino de
// producción —publish() crea la in-app en el acto y encola solo los externos—
// pero se conserva porque es la unidad natural para tests y para reprocesar un
// evento suelto a mano.
export async function procesarEvento(admin: SupabaseClient, event: NotificationEvent): Promise<ResultadoProceso> {
  const { creadas, omitidas } = await crearInApp(admin, event);
  let deliveries = creadas.length; // el delivery INAPP ya lo escribió crearInApp
  for (const c of creadas) {
    deliveries += await entregarCanales(admin, c.fila, c.destinatario, c.canalesExtra);
  }
  return { creadas: creadas.length, deliveries, omitidas };
}

// Envía los canales EXTERNOS de una notificación ya creada y registra su delivery.
async function entregarCanales(
  admin: SupabaseClient, fila: NotificationRow, dest: Recipient, canales: NotificationChannel[],
): Promise<number> {
  if (canales.length === 0) return 0;
  let n = 0;
  for (const ch of canales) {
    const canal = CANALES[ch];
    const res = canal
      ? await canal.enviar({ admin, notificacion: fila, destinatario: dest })
      : { status: 'SKIPPED' as const, error: `canal ${ch} no implementado` };
    await admin.from('notification_delivery').insert({
      id: `del-${randomUUID()}`,
      notification_id: fila.id,
      studio_id: fila.studioId,
      channel: ch,
      status: res.status,
      attempts: res.status === 'SENT' || res.status === 'DELIVERED' ? 1 : res.status === 'FAILED' ? 1 : 0,
      error: res.error ?? null,
      provider_id: res.providerId ?? null,
      sent_at: res.status === 'SENT' || res.status === 'DELIVERED' ? new Date().toISOString() : null,
    });
    n++;
  }
  return n;
}

// Lo que ejecuta el worker de Inngest: entregar los canales externos de
// notificaciones que YA existen (las creó publish() de forma síncrona).
// Recalcula los canales desde la regla + las preferencias del destinatario, así
// que no hace falta transportarlos en el evento.
export async function entregarExternos(
  admin: SupabaseClient, notificationIds: string[],
): Promise<{ entregadas: number; deliveries: number }> {
  let entregadas = 0, deliveries = 0;
  for (const id of notificationIds) {
    const { data: noti } = await admin.from('notification').select('*').eq('id', id).maybeSingle();
    if (!noti) continue;
    const regla = REGLAS[noti.event_type as string];
    if (!regla) continue;

    // Si ya hay deliveries externos de esta notificación, no repetir (el worker
    // puede reintentarse: Inngest reintenta la función entera).
    const { data: previos } = await admin.from('notification_delivery')
      .select('channel').eq('notification_id', id).neq('channel', 'INAPP');
    if (previos && previos.length > 0) continue;

    const dest: Recipient = {
      role: noti.recipient_role,
      userId: noti.recipient_user_id,
      socioId: noti.recipient_socio_id,
      instructorId: noti.recipient_instructor_id,
    };
    // Email/teléfono para los canales externos (la fila no los guarda).
    if (dest.socioId) {
      const { data: soc } = await admin.from('socios').select('email, telefono').eq('id', dest.socioId).maybeSingle();
      dest.email = (soc?.email as string | null) ?? null;
      dest.telefono = (soc?.telefono as string | null) ?? null;
    } else if (dest.instructorId) {
      const { data: ins } = await admin.from('instructores').select('email').eq('id', dest.instructorId).maybeSingle();
      dest.email = (ins?.email as string | null) ?? null;
    } else {
      const { data: st } = await admin.from('studios').select('email, telefono').eq('id', noti.studio_id).maybeSingle();
      dest.email = (st?.email as string | null) ?? null;
      dest.telefono = (st?.telefono as string | null) ?? null;
    }

    const critica = regla.priority === 'CRITICA';
    const pref = dest.userId ? await preferenciaDe(admin, dest.userId, regla.category) : PREF_DEFECTO;
    const canales = canalesExtraDe(regla, pref, critica);
    const n = await entregarCanales(admin, mapRow(noti), dest, canales);
    if (n > 0) entregadas++;
    deliveries += n;
  }
  return { entregadas, deliveries };
}

function mapRow(row: Record<string, unknown>): NotificationRow {
  return {
    id: row.id as string, studioId: row.studio_id as string,
    recipientRole: row.recipient_role as NotificationRow['recipientRole'],
    recipientUserId: (row.recipient_user_id as string | null) ?? null,
    recipientSocioId: (row.recipient_socio_id as string | null) ?? null,
    recipientInstructorId: (row.recipient_instructor_id as string | null) ?? null,
    eventType: row.event_type as string, category: row.category as NotificationCategory,
    priority: row.priority as NotificationRow['priority'],
    title: row.title as string, body: row.body as string,
    resourceType: (row.resource_type as string | null) ?? null,
    resourceId: (row.resource_id as string | null) ?? null,
    deepLink: (row.deep_link as string | null) ?? null,
    data: (row.data as Record<string, unknown> | null) ?? null,
    readAt: null, archivedAt: (row.archived_at as string | null) ?? null,
    createdAt: new Date().toISOString(),
  };
}

// Reintenta los deliveries fallidos de una notificación (Notification Center).
export async function retry(notificationId: string): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  const { data: noti } = await admin.from('notification').select('*').eq('id', notificationId).maybeSingle();
  if (!noti) return;
  const { data: fallidos } = await admin.from('notification_delivery')
    .select('*').eq('notification_id', notificationId).eq('status', 'FAILED');
  for (const d of fallidos ?? []) {
    const canal = CANALES[d.channel as NotificationChannel];
    if (!canal) continue;
    const dest: Recipient = {
      role: noti.recipient_role, userId: noti.recipient_user_id,
      socioId: noti.recipient_socio_id, instructorId: noti.recipient_instructor_id,
    };
    const res = await canal.enviar({ admin, notificacion: mapRow(noti), destinatario: dest });
    await admin.from('notification_delivery').update({
      status: res.status, attempts: (d.attempts as number) + 1, error: res.error ?? null,
      sent_at: res.status === 'SENT' ? new Date().toISOString() : d.sent_at,
    }).eq('id', d.id);
  }
}
