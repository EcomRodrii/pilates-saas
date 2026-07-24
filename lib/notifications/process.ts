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
import { REGLAS, plantillaDe, render, type ReglaEvento } from './catalog.ts';
import { resolverDestinatarios } from './recipients.ts';
import { CANALES } from './channels.ts';
import type {
  NotificationCategory, NotificationChannel, NotificationEvent, NotificationRow, Recipient,
} from './types.ts';

export interface Preferencia { inapp: boolean; push: boolean; email: boolean; whatsapp: boolean; sms: boolean; }
const PREF_DEFECTO: Preferencia = { inapp: true, push: true, email: false, whatsapp: false, sms: false };

// Canales EXTRA (además del in-app) para un destinatario. Reglas:
//  · PUSH: solo en eventos que lo traen por defecto (regla.canales) y si no lo apagó.
//  · EMAIL/WhatsApp/SMS: dirigidos por PREFERENCIA (opt-in; off por defecto) — si
//    el usuario los activa para esa categoría, se envían. Las CRÍTICAS fuerzan
//    todos los canales (los no configurados devuelven SKIPPED, no se pierde nada).
export function canalesExtraDe(regla: ReglaEvento, pref: Preferencia, critica: boolean): NotificationChannel[] {
  const out: NotificationChannel[] = [];
  if (regla.canales.includes('PUSH') && (critica || pref.push)) out.push('PUSH');
  if (critica || pref.email) out.push('EMAIL');
  if (critica || pref.whatsapp) out.push('WHATSAPP');
  if (critica || pref.sms) out.push('SMS');
  // `excluye` manda sobre todo: ni la preferencia del usuario ni la prioridad
  // CRÍTICA pueden meter un canal vetado para ese evento (p. ej. avisar por
  // email de que los emails están fallando).
  return regla.excluye?.length ? out.filter(c => !regla.excluye!.includes(c)) : out;
}

async function preferenciaDe(admin: SupabaseClient, userId: string, category: NotificationCategory): Promise<Preferencia> {
  const { data } = await admin.from('notification_preference')
    .select('inapp, push, email, whatsapp, sms').eq('user_id', userId).eq('category', category).maybeSingle();
  if (!data) return PREF_DEFECTO;
  return {
    inapp: data.inapp as boolean, push: data.push as boolean, email: data.email as boolean,
    whatsapp: data.whatsapp as boolean, sms: data.sms as boolean,
  };
}

export interface ResultadoProceso { creadas: number; deliveries: number; omitidas: number; }

// Núcleo: de un evento a filas de notificación + deliveries. Idempotente.
export async function procesarEvento(admin: SupabaseClient, event: NotificationEvent): Promise<ResultadoProceso> {
  const regla = REGLAS[event.type];
  if (!regla) return { creadas: 0, deliveries: 0, omitidas: 0 };

  const destinatarios = event.recipients ?? await resolverDestinatarios(admin, regla.audiencia, event);
  const data = event.data ?? {};
  let creadas = 0, deliveries = 0, omitidas = 0;

  for (const dest of destinatarios) {
    const pl = plantillaDe(event.type, dest.role);
    if (!pl) { omitidas++; continue; }

    const critica = regla.priority === 'CRITICA';
    const pref = dest.userId ? await preferenciaDe(admin, dest.userId, regla.category) : PREF_DEFECTO;
    const quiereInapp = critica || pref.inapp;
    const canalesExtra = canalesExtraDe(regla, pref, critica);

    if (!quiereInapp && canalesExtra.length === 0) { omitidas++; continue; }

    const dedupKey = event.dedupKey
      ? `${event.dedupKey}:${dest.userId ?? dest.socioId ?? dest.instructorId ?? 'anon'}`
      : null;

    const row = {
      id: `not-${randomUUID()}`,
      studio_id: event.studioId,
      recipient_role: dest.role,
      recipient_user_id: dest.userId,
      recipient_socio_id: dest.socioId ?? null,
      recipient_instructor_id: dest.instructorId ?? null,
      event_type: event.type,
      category: regla.category,
      priority: regla.priority,
      title: render(pl.title, data),
      body: render(pl.body, data),
      resource_type: event.resource?.type ?? null,
      resource_id: event.resource?.id ?? null,
      deep_link: pl.deepLink?.(data) ?? null,
      data,
      dedup_key: dedupKey,
      archived_at: quiereInapp ? null : new Date().toISOString(),
    };

    const { error } = await admin.from('notification').insert(row);
    if (error) {
      if ((error as { code?: string }).code === '23505') { omitidas++; continue; }
      console.error('[notifications] insert falló:', error.message);
      omitidas++; continue;
    }
    creadas++;

    const notiRow = mapRow(row);
    const canales: NotificationChannel[] = [...(quiereInapp ? ['INAPP' as const] : []), ...canalesExtra];
    for (const ch of canales) {
      const canal = CANALES[ch];
      const res = canal
        ? await canal.enviar({ admin, notificacion: notiRow, destinatario: dest })
        : { status: 'SKIPPED' as const, error: `canal ${ch} no implementado` };
      await admin.from('notification_delivery').insert({
        id: `del-${randomUUID()}`,
        notification_id: row.id,
        studio_id: event.studioId,
        channel: ch,
        status: res.status,
        attempts: res.status === 'SENT' || res.status === 'DELIVERED' ? 1 : res.status === 'FAILED' ? 1 : 0,
        error: res.error ?? null,
        provider_id: res.providerId ?? null,
        sent_at: res.status === 'SENT' || res.status === 'DELIVERED' ? new Date().toISOString() : null,
      });
      deliveries++;
    }
  }

  return { creadas, deliveries, omitidas };
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
