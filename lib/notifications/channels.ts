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
import { conReintentoResend } from '../emails/resend-reintentos.ts';
import { urlMonograma } from '../monograma-estudio.ts';
import { configApns, enviarApns, esEndpointApns } from './apns.ts';

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
// VAPID o sin suscripción → SKIPPED (no es error, es que aún no aplica). web-push
// se importa perezoso para no cargarlo salvo cuando de verdad hay que enviar.
//
// Auditoría de notificaciones (27-sep-2026). Lo que esto hacía mal antes:
//  · Los endpoints iban en SERIE y sin plazo: un servicio de push lento retenía a
//    los demás y a la propia petición.
//  · Solo 404/410 se distinguían. Un 429/5xx/timeout (transitorio) se daba por
//    FAILED definitivo —«un FAILED no se reintenta solo»— y la notificación se
//    perdía por un parpadeo del proveedor.
//  · Un 400/401/403 (payload o VAPID rechazados) quedaba como «error push» sin
//    decir qué endpoint ni con qué código.
//  · `failure_count` existía y NADIE lo tocaba: una suscripción rota para siempre
//    (no 410) se reintentaba en cada aviso hasta el fin de los tiempos.
//  · `tag` era el tipo de evento: dos «reserva confirmada» seguidas se pisaban en
//    el dispositivo (la segunda sustituía a la primera, sin sonido).
//  · No se mandaba `TTL` ni `urgency`: un recordatorio de 1 h podía llegar al
//    móvil horas después, con la clase ya empezada.
//  · El resultado por endpoint no se guardaba en ningún sitio: «no le llegó a esta
//    alumna, ¿por qué?» no tenía respuesta.

export type EstadoEndpoint = 'ok' | 'caducada' | 'transitorio' | 'rechazado';

export interface ResultadoEndpoint {
  id: string;
  /** Solo el host del servicio de push (fcm, apple…): el endpoint entero es un secreto. */
  host: string;
  estado: EstadoEndpoint;
  codigo?: number;
  detalle?: string;
}

export interface EndpointPush {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  failure_count?: number | null;
}

type Enviador = (
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string,
  opciones: { TTL: number; urgency: 'very-low' | 'low' | 'normal' | 'high'; timeout: number },
) => Promise<{ statusCode?: number }>;

/** Fallos SEGUIDOS de una suscripción (no 410) tras los que se retira. */
export const FALLOS_PARA_RETIRAR = 10;
const REINTENTOS_TRANSITORIOS = 2;
const PLAZO_ENDPOINT_MS = 8_000;
const ESPERA_REINTENTO_MS = [400, 1_200];

export function hostDeEndpoint(endpoint: string): string {
  // El token de la app de iOS no es una URL: va a APNs (lib/notifications/apns.ts).
  if (esEndpointApns(endpoint)) return 'api.push.apple.com';
  try { return new URL(endpoint).host; } catch { return 'desconocido'; }
}

/** El nombre corto que se enseña: fcm, apple, mozilla, windows… */
export function proveedorDePush(host: string): string {
  if (host.includes('fcm.googleapis') || host.includes('googleapis')) return 'fcm';
  if (host.includes('push.apple.com')) return 'apple';
  if (host.includes('mozilla')) return 'mozilla';
  if (host.includes('notify.windows')) return 'windows';
  return host.split('.').slice(-2, -1)[0] || host;
}

export function opcionesPush(prioridad: string): { TTL: number; urgency: 'very-low' | 'low' | 'normal' | 'high' } {
  // Un aviso urgente pierde valor rápido (plaza libre, clase cancelada): que el
  // proveedor no lo guarde más de 6 h. El resto aguanta un día.
  const urgente = prioridad === 'CRITICA' || prioridad === 'ALTA';
  return {
    TTL: urgente ? 6 * 3600 : 24 * 3600,
    urgency: urgente ? 'high' : prioridad === 'BAJA' ? 'low' : 'normal',
  };
}

function clasificar(codigo: number | undefined): EstadoEndpoint {
  if (codigo != null && codigo >= 200 && codigo < 300) return 'ok';
  if (codigo === 404 || codigo === 410) return 'caducada';
  // Sin código = red caída/timeout; 429 y 5xx = el servicio de push, no la suscripción.
  if (codigo == null || codigo === 429 || codigo >= 500) return 'transitorio';
  return 'rechazado'; // 400/401/403/413…: payload, VAPID o suscripción inválidos
}

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Manda el mismo payload a todos los endpoints EN PARALELO, con plazo y con
 * reintentos acotados para los fallos transitorios. Nunca lanza: un endpoint roto
 * no puede impedir el envío a los demás.
 */
export async function enviarAEndpoints(
  endpoints: readonly EndpointPush[],
  payload: string,
  prioridad: string,
  enviar: Enviador,
  espera: (ms: number) => Promise<void> = dormir,
): Promise<ResultadoEndpoint[]> {
  const opciones = { ...opcionesPush(prioridad), timeout: PLAZO_ENDPOINT_MS };
  return Promise.all(endpoints.map(async (e): Promise<ResultadoEndpoint> => {
    const host = hostDeEndpoint(e.endpoint);
    let ultimo: ResultadoEndpoint = { id: e.id, host, estado: 'transitorio' };
    for (let intento = 0; intento <= REINTENTOS_TRANSITORIOS; intento++) {
      let codigo: number | undefined;
      let detalle: string | undefined;
      try {
        const r = await enviar({ endpoint: e.endpoint, keys: { p256dh: e.p256dh, auth: e.auth } }, payload, opciones);
        codigo = r?.statusCode ?? 201;
      } catch (err) {
        codigo = (err as { statusCode?: number }).statusCode;
        detalle = err instanceof Error ? err.message.slice(0, 120) : 'error push';
      }
      ultimo = { id: e.id, host, estado: clasificar(codigo), ...(codigo != null ? { codigo } : {}), ...(detalle ? { detalle } : {}) };
      if (ultimo.estado !== 'transitorio' || intento === REINTENTOS_TRANSITORIOS) break;
      await espera(ESPERA_REINTENTO_MS[intento] ?? 1_000);
    }
    return ultimo;
  }));
}

/** El veredicto y el texto que queda en `notification_delivery` para «¿por qué no le llegó?». */
export function resumirPush(res: readonly ResultadoEndpoint[], retiradas: number): ResultadoCanal {
  const partes = res.map((r) => `${proveedorDePush(r.host)}:${r.codigo ?? 'sin-respuesta'}${r.estado === 'ok' ? '' : `(${r.estado})`}`);
  const ok = res.filter((r) => r.estado === 'ok').length;
  const providerId = `${ok}/${res.length} · ${partes.join(' ')}`.slice(0, 250);
  if (ok > 0) return { status: 'SENT', providerId };
  const fallidos = res.filter((r) => r.estado === 'transitorio' || r.estado === 'rechazado');
  if (fallidos.length === 0) {
    return { status: 'SKIPPED', providerId, error: `suscripción caducada: se ha retirado${retiradas > 1 ? ` (${retiradas})` : ''}; hay que volver a activar los avisos en ese dispositivo` };
  }
  const f = fallidos[0];
  const que = f.estado === 'rechazado'
    ? 'el servicio de push rechazó el envío'
    : 'el servicio de push no respondió a tiempo';
  return { status: 'FAILED', providerId, error: `${que} (${proveedorDePush(f.host)} ${f.codigo ?? 'sin respuesta'})${f.detalle ? `: ${f.detalle}` : ''}` };
}

const push: Canal = {
  nombre: 'PUSH',
  async enviar({ admin, notificacion, destinatario }) {
    if (!destinatario.userId) return { status: 'SKIPPED', error: 'destinatario sin cuenta' };
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const vapidListo = !!(publicKey && privateKey);
    // La app de iOS: sus tokens viven en la misma tabla (`apns://…`) y van por APNs.
    const apns = configApns();
    if (!vapidListo && !apns) return { status: 'SKIPPED', error: 'push no configurado (VAPID pendiente)' };

    const { data: todas, error: errSubs } = await admin.from('push_subscription')
      .select('id, endpoint, p256dh, auth, failure_count').eq('user_id', destinatario.userId);
    // Leer mal NO es «no tiene suscripción»: se dice, no se calla.
    if (errSubs) return { status: 'FAILED', error: `no se pudieron leer sus suscripciones: ${errSubs.message}` };
    if (!todas || todas.length === 0) return { status: 'SKIPPED', error: 'sin suscripción push: la usuaria no ha activado los avisos en ningún dispositivo' };
    // Solo las que este servidor sabe mandar: sin VAPID no hay web; sin clave de APNs, no hay iPhone.
    const subs = todas.filter((s) => (esEndpointApns(s.endpoint as string) ? !!apns : vapidListo));
    if (subs.length === 0) {
      return { status: 'SKIPPED', error: apns ? 'push web no configurado (VAPID pendiente)' : 'avisos de la app de iOS sin configurar (falta la clave de APNs)' };
    }

    // El icono mostraba SIEMPRE el logo genérico de Tentare (hardcodeado en
    // public/sw.js), aunque cada estudio ya puede subir el suyo desde
    // Apariencia (mismo studio.logoUrl que usa el manifest del portal y los
    // emails). Se manda en el payload, y con logo no cambia nada; sin logo ya
    // no cae al genérico de Tentare — cae al monograma del propio estudio
    // (inicial + su color de marca), mismo criterio que el manifest de la PWA.
    const { data: st } = await admin.from('studios').select('logo_url, nombre, color_primario').eq('id', notificacion.studioId).maybeSingle();
    const logoUrl = st?.logo_url as string | null;
    const webpush = vapidListo ? (await import('web-push')).default : null;
    if (webpush) webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:soporte@tentare.app', publicKey!, privateKey!);
    const payload = JSON.stringify({
      title: notificacion.title, body: notificacion.body,
      url: notificacion.deepLink || '/',
      // Una etiqueta POR notificación: con el tipo de evento como etiqueta, dos
      // avisos del mismo tipo seguidos se sustituían en el dispositivo.
      tag: notificacion.id,
      // El service worker devuelve este id al recibir y al pulsar: así se sabe si
      // el aviso llegó de verdad al dispositivo (`/api/notifications/receipt`).
      nid: notificacion.id,
      icon: logoUrl || urlMonograma(st?.nombre as string | undefined, st?.color_primario as string | undefined, 192),
    });

    const resultados = await enviarAEndpoints(
      subs as EndpointPush[], payload, notificacion.priority,
      (sub, cuerpo, opciones) => (esEndpointApns(sub.endpoint)
        ? enviarApns(sub.endpoint, cuerpo, opciones, apns!)
        : webpush!.sendNotification(sub, cuerpo, opciones)),
    );

    const caducadas = resultados.filter((r) => r.estado === 'caducada').map((r) => r.id);
    if (caducadas.length > 0) await admin.from('push_subscription').delete().in('id', caducadas);
    // failure_count: se sube con cada fallo que no es «caducada», y se retira la
    // que lleva demasiados seguidos. Sin esto una suscripción rota para siempre
    // se reintentaba en cada aviso, eternamente.
    for (const r of resultados) {
      const previa = (subs.find((s) => s.id === r.id)?.failure_count as number | null | undefined) ?? 0;
      if (r.estado === 'ok' && previa > 0) {
        await admin.from('push_subscription').update({ failure_count: 0 }).eq('id', r.id);
      } else if (r.estado === 'transitorio' || r.estado === 'rechazado') {
        if (previa + 1 >= FALLOS_PARA_RETIRAR) await admin.from('push_subscription').delete().eq('id', r.id);
        else await admin.from('push_subscription').update({ failure_count: previa + 1 }).eq('id', r.id);
      }
    }
    return resumirPush(resultados, caducadas.length);
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
    // En un const: el estrechamiento de `destinatario.email` se pierde dentro
    // del callback de `conReintentoResend` (TS no puede saber que nadie lo ha
    // mutado entre medias).
    const emailDestino = destinatario.email;
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
      // ⚠️ Auditoría 2026-09-23 (AUT-7): este `send` iba a pelo, sin
      // `conReintentoResend` — el helper que existe justo para esto («un 429 de
      // "10 req/s" se registraba como FALLIDO para siempre»). Un aviso a todo un
      // estudio son decenas de envíos seguidos, y `lib/notifications/process.ts`
      // documenta que «un FAILED no se reintenta solo»: el primero que cayera en
      // el límite de tasa se perdía definitivamente. Reintentar no puede
      // duplicar: el `idempotencyKey` ya estaba puesto.
      const { data, error } = await conReintentoResend(() => resend.emails.send(
        {
          from, to: [emailDestino], subject: notificacion.title, html,
          ...(replyTo ? { replyTo } : {}),
        },
        { idempotencyKey: `noti-${notificacion.id}` },
      ));
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
