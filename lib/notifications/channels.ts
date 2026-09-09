// ─────────────────────────────────────────────────────────────────────────────
// Notification Engine — CANALES (server-only).
//
// Cada canal implementa la misma interfaz `Canal`. El motor no sabe nada del
// canal concreto: itera el registro. Añadir un canal = añadir una entrada a
// CANALES envolviendo el wrapper que ya existe (lib/emails/send-server.ts) —
// sin tocar la lógica de negocio.
//
// Fase 1: INAPP (la fila ya materializada) + PUSH (stub que se completa en PR2).
// ─────────────────────────────────────────────────────────────────────────────
import type { SupabaseClient } from '@supabase/supabase-js';
import { LEGAL } from '../legal-info.ts';
import type { DeliveryStatus, NotificationChannel, NotificationRow, Recipient } from './types.ts';
import { remitentePorMarca } from '../emails/remitente.ts';
import { urlMonograma } from '../monograma-estudio.ts';

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

    // El icono mostraba SIEMPRE el logo genérico de Tentare (hardcodeado en
    // public/sw.js), aunque cada estudio ya puede subir el suyo desde
    // Apariencia (mismo studio.logoUrl que usa el manifest del portal y los
    // emails). Se manda en el payload, y con logo no cambia nada; sin logo ya
    // no cae al genérico de Tentare — cae al monograma del propio estudio
    // (inicial + su color de marca), mismo criterio que el manifest de la PWA.
    const { data: st } = await admin.from('studios').select('logo_url, nombre, color_primario').eq('id', notificacion.studioId).maybeSingle();
    const logoUrl = st?.logo_url as string | null;
    const webpush = (await import('web-push')).default;
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:soporte@tentare.app', publicKey, privateKey);
    const payload = JSON.stringify({
      title: notificacion.title, body: notificacion.body,
      url: notificacion.deepLink || '/', tag: notificacion.eventType,
      icon: logoUrl || urlMonograma(st?.nombre as string | undefined, st?.color_primario as string | undefined, 192),
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
      .select('nombre, color_primario, logo_url, email').eq('id', notificacion.studioId).maybeSingle();
    const color = (st?.color_primario as string | null) || '#343825';
    const estudio = (st?.nombre as string | null) || 'Tentare';
    const logo = st?.logo_url as string | null;
    const base = process.env.NEXT_PUBLIC_APP_URL || LEGAL.url;
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
      // Este canal EMAIL lo usan tanto avisos a staff (propietaria/manager/
      // recepción/instructora) como a socias — el remitente con nombre del
      // estudio solo tiene sentido cuando quien recibe es una socia; el resto
      // sigue viendo "Tentare" (es el propio producto avisando al equipo).
      const from = destinatario.role === 'SOCIA' ? remitentePorMarca(estudio) : (process.env.RESEND_FROM || 'Tentare <onboarding@resend.dev>');
      // Reply-To solo cuando quien recibe es una SOCIA, por el mismo motivo
      // que el remitente: si el aviso es para el equipo del estudio, poner su
      // propia dirección como respuesta les haría escribirse a sí mismos.
      const replyTo = destinatario.role === 'SOCIA' ? ((st?.email as string | null) ?? '').trim() : '';
      const { data, error } = await resend.emails.send(
        {
          from, to: [destinatario.email], subject: notificacion.title, html,
          ...(replyTo ? { replyTo } : {}),
        },
        { idempotencyKey: `noti-${notificacion.id}` },
      );
      if (error) return { status: 'FAILED', error: error.message };
      return { status: 'SENT', providerId: data?.id };
    } catch (e) {
      return { status: 'FAILED', error: e instanceof Error ? e.message : 'error email' };
    }
  },
};

// WHATSAPP y SMS: RETIRADOS el 2026-09-09, junto con Twilio.
//
// No es una degradación disimulada, y conviene entender por qué antes de que a
// alguien le parezca un hueco que rellenar con la Meta Cloud API:
//
// - Nunca entregaron nada. En producción no existía ninguna variable TWILIO_*,
//   y `notification_delivery` lo confirma: 0 filas de WHATSAPP y 0 de SMS en
//   sus 838 entregas. El canal existía en el catálogo y en la pantalla de
//   preferencias, no en la realidad.
// - Solo los pedían DOS eventos —SISTEMA_ERROR y SISTEMA_STRIPE_DESCONECTADO—,
//   los dos con `audiencia: 'propietaria'`, o sea con `studios.telefono` de
//   destino. Los dos conservan PUSH y EMAIL, que sí funcionan (VAPID
//   configurado, 125 entregas PUSH reales).
// - Y por eso tampoco se han migrado a Meta como los demás emisores: aquí el
//   destinatario ES el estudio. Mandarle un aviso de plataforma desde su propio
//   WhatsApp Business es escribirse a sí misma —Meta rechaza un envío al mismo
//   número que lo emite— y encima haría depender el aviso «algo va mal en tu
//   Tentare» de una integración que puede ser justo lo que va mal.
//
// Si algún día hace falta un canal de móvil para avisos de plataforma, será una
// decisión nueva (con qué credencial, de quién) y no rellenar este hueco.

export const CANALES: Record<NotificationChannel, Canal | undefined> = {
  INAPP: inapp,
  PUSH: push,
  EMAIL: email,
};
