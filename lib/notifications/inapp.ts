// ─────────────────────────────────────────────────────────────────────────────
// Notification Engine — creación de la notificación IN-APP (síncrona).
//
// Esto es lo que hace que el sistema NO dependa de la cola: escribir la fila de
// `notification` es un INSERT, y se hace en el acto, dentro de la misma petición
// que provocó el evento. Si Inngest está caído, mal configurado o no tiene el
// worker registrado, la campana SIGUE funcionando.
//
// Los canales EXTERNOS (push/email/WhatsApp/SMS) sí son lentos y con reintentos:
// esos se delegan a la cola (best-effort) usando los ids que devuelve esta
// función. Por eso aquí NO se importa `channels.ts` — arrastra `web-push`
// (módulos de Node) y este módulo es alcanzable desde el bundle de cliente.
// ─────────────────────────────────────────────────────────────────────────────
import type { SupabaseClient } from '@supabase/supabase-js';
import { REGLAS, plantillaDe, render, type ReglaEvento } from './catalog.ts';
import { resolverDestinatarios } from './recipients.ts';
import type {
  NotificationCategory, NotificationChannel, NotificationEvent, NotificationRow, Recipient,
} from './types.ts';

export interface Preferencia { inapp: boolean; push: boolean; email: boolean; whatsapp: boolean; sms: boolean; }
export const PREF_DEFECTO: Preferencia = { inapp: true, push: true, email: false, whatsapp: false, sms: false };

// Canales EXTRA (además del in-app) para un destinatario. Reglas:
//  · PUSH: solo en eventos que lo traen por defecto (regla.canales) y si no lo apagó.
//  · EMAIL/WhatsApp/SMS: dirigidos por PREFERENCIA (opt-in; off por defecto).
//  · Las CRÍTICAS fuerzan todos los canales (los no configurados → SKIPPED).
//  · `excluye` manda sobre todo (p. ej. no avisar por email de que el email falla).
export function canalesExtraDe(regla: ReglaEvento, pref: Preferencia, critica: boolean): NotificationChannel[] {
  const out: NotificationChannel[] = [];
  if (regla.canales.includes('PUSH') && (critica || pref.push)) out.push('PUSH');
  if (critica || pref.email) out.push('EMAIL');
  if (critica || pref.whatsapp) out.push('WHATSAPP');
  if (critica || pref.sms) out.push('SMS');
  return regla.excluye?.length ? out.filter(c => !regla.excluye!.includes(c)) : out;
}

export async function preferenciaDe(
  admin: SupabaseClient, userId: string, category: NotificationCategory,
): Promise<Preferencia> {
  const { data } = await admin.from('notification_preference')
    .select('inapp, push, email, whatsapp, sms').eq('user_id', userId).eq('category', category).maybeSingle();
  if (!data) return PREF_DEFECTO;
  return {
    inapp: data.inapp as boolean, push: data.push as boolean, email: data.email as boolean,
    whatsapp: data.whatsapp as boolean, sms: data.sms as boolean,
  };
}

export interface NotificacionCreada {
  id: string;
  destinatario: Recipient;
  canalesExtra: NotificationChannel[];
  // La fila recién creada, para que quien entregue los canales externos no tenga
  // que volver a leerla de la base de datos.
  fila: NotificationRow;
}

export interface ResultadoInApp {
  creadas: NotificacionCreada[];
  omitidas: number;
}

// Crea la notificación in-app de cada destinatario del evento (y su delivery
// INAPP). Idempotente por `dedup_key`: reprocesar el mismo hecho no duplica.
// Devuelve, por notificación creada, qué canales externos habría que intentar.
export async function crearInApp(admin: SupabaseClient, event: NotificationEvent): Promise<ResultadoInApp> {
  const regla = REGLAS[event.type];
  if (!regla) return { creadas: [], omitidas: 0 };

  const destinatarios = event.recipients ?? await resolverDestinatarios(admin, regla.audiencia, event);
  const data = event.data ?? {};
  const creadas: NotificacionCreada[] = [];
  let omitidas = 0;

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

    const id = `not-${crypto.randomUUID()}`;
    const title = render(pl.title, data);
    const body = render(pl.body, data);
    const deepLink = pl.deepLink?.(data) ?? null;
    const archivedAt = quiereInapp ? null : new Date().toISOString();
    const { error } = await admin.from('notification').insert({
      id,
      studio_id: event.studioId,
      recipient_role: dest.role,
      recipient_user_id: dest.userId,
      recipient_socio_id: dest.socioId ?? null,
      recipient_instructor_id: dest.instructorId ?? null,
      event_type: event.type,
      category: regla.category,
      priority: regla.priority,
      title,
      body,
      resource_type: event.resource?.type ?? null,
      resource_id: event.resource?.id ?? null,
      deep_link: deepLink,
      data,
      dedup_key: dedupKey,
      // Si no quiere in-app pero sí un canal externo, la fila existe (es el ancla
      // del envío y del historial) pero nace archivada: fuera de la campana.
      archived_at: archivedAt,
    });
    if (error) {
      // 23505 = choque con dedup → ese hecho ya se notificó a esta persona.
      if ((error as { code?: string }).code !== '23505') {
        console.error('[notifications] insert falló:', error.message);
      }
      omitidas++;
      continue;
    }

    // Delivery del canal in-app: la propia fila ES la entrega. Sin cuenta
    // reclamada no puede iniciar sesión → SKIPPED.
    if (quiereInapp) {
      await admin.from('notification_delivery').insert({
        id: `del-${crypto.randomUUID()}`,
        notification_id: id,
        studio_id: event.studioId,
        channel: 'INAPP',
        status: dest.userId ? 'SENT' : 'SKIPPED',
        attempts: dest.userId ? 1 : 0,
        error: dest.userId ? null : 'destinatario sin cuenta',
        sent_at: dest.userId ? new Date().toISOString() : null,
      });
    }

    creadas.push({
      id, destinatario: dest, canalesExtra,
      fila: {
        id, studioId: event.studioId, recipientRole: dest.role,
        recipientUserId: dest.userId, recipientSocioId: dest.socioId ?? null,
        recipientInstructorId: dest.instructorId ?? null,
        eventType: event.type, category: regla.category, priority: regla.priority,
        title, body,
        resourceType: event.resource?.type ?? null, resourceId: event.resource?.id ?? null,
        deepLink, data, readAt: null, archivedAt, createdAt: new Date().toISOString(),
      },
    });
  }

  return { creadas, omitidas };
}
