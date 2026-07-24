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

// EMAIL: correo genérico de notificación con la marca del estudio, vía Resend.
// Opt-in (off por defecto en preferencias). Sin RESEND o sin email → SKIPPED.
// Import perezoso de `resend` para no cargarlo salvo cuando de verdad se envía.
const esc = (s: string) => s.replace(/[<>&]/g, (c) => (c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;'));

const email: Canal = {
  nombre: 'EMAIL',
  async enviar({ admin, notificacion, destinatario }) {
    if (!destinatario.email) return { status: 'SKIPPED', error: 'destinatario sin email' };
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey || apiKey.startsWith('re_XXXX')) return { status: 'SKIPPED', error: 'email no configurado' };

    const { data: st } = await admin.from('studios')
      .select('nombre, color_primario, logo_url').eq('id', notificacion.studioId).maybeSingle();
    const color = (st?.color_primario as string | null) || '#6D28D9';
    const estudio = (st?.nombre as string | null) || 'Tentare';
    const logo = st?.logo_url as string | null;
    const base = process.env.NEXT_PUBLIC_APP_URL || 'https://tentare.app';
    const cta = notificacion.deepLink
      ? `<a href="${base}${notificacion.deepLink}" style="display:inline-block;margin-top:20px;padding:11px 20px;background:${color};color:#fff;border-radius:10px;text-decoration:none;font-weight:700">Ver detalles</a>`
      : '';
    const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a1a">`
      + (logo ? `<img src="${logo}" alt="${esc(estudio)}" style="height:40px;margin-bottom:20px"/>` : `<p style="font-weight:800;color:${color};margin:0 0 20px">${esc(estudio)}</p>`)
      + `<h1 style="font-size:20px;margin:0 0 8px">${esc(notificacion.title)}</h1>`
      + `<p style="font-size:15px;line-height:1.5;color:#444;margin:0">${esc(notificacion.body)}</p>${cta}`
      + `<p style="font-size:12px;color:#999;margin-top:28px">${esc(estudio)} · enviado con Tentare</p></div>`;

    try {
      const { Resend } = await import('resend');
      const resend = new Resend(apiKey);
      const { data, error } = await resend.emails.send(
        { from: process.env.RESEND_FROM || 'Tentare <onboarding@resend.dev>', to: [destinatario.email], subject: notificacion.title, html },
        { idempotencyKey: `noti-${notificacion.id}` },
      );
      if (error) return { status: 'FAILED', error: error.message };
      return { status: 'SENT', providerId: data?.id };
    } catch (e) {
      return { status: 'FAILED', error: e instanceof Error ? e.message : 'error email' };
    }
  },
};

// WhatsApp y SMS: envuelven lib/twilio.ts (env-gated). Opt-in. Sin teléfono →
// SKIPPED; sin Twilio configurado → SKIPPED (no es fallo duro). Nota: los
// mensajes WhatsApp iniciados por el negocio fuera de la ventana de 24 h
// requieren plantilla aprobada en Twilio — hasta entonces solo entregan SMS o
// WhatsApp dentro de sesión.
function canalTwilio(nombre: 'WHATSAPP' | 'SMS'): Canal {
  return {
    nombre,
    async enviar({ notificacion, destinatario }) {
      if (!destinatario.telefono) return { status: 'SKIPPED', error: 'destinatario sin teléfono' };
      const { enviarMensajeTwilio } = await import('@/lib/twilio');
      const r = await enviarMensajeTwilio({ canal: nombre, to: destinatario.telefono, cuerpo: `${notificacion.title}\n${notificacion.body}` });
      if (r.skipped) return { status: 'SKIPPED', error: r.error };
      if (r.ok) return { status: 'SENT', providerId: r.id };
      return { status: 'FAILED', error: r.error };
    },
  };
}

export const CANALES: Record<NotificationChannel, Canal | undefined> = {
  INAPP: inapp,
  PUSH: push,
  EMAIL: email,
  WHATSAPP: canalTwilio('WHATSAPP'),
  SMS: canalTwilio('SMS'),
};
