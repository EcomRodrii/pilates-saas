// WhatsApp Business — Meta Cloud API. Cada estudio pega su PROPIO token de
// acceso y su ID de número de teléfono (su propia app de Meta for Developers,
// su propio número de WhatsApp Business) en Configuración → Integraciones —
// no hay cuenta compartida de plataforma. Mismo mecanismo que Kisi/Resend:
// tabla `integraciones` por estudio (ver dbUpsertIntegracion).
//
// Nota: esto es DISTINTO de lib/twilio.ts, que envuelve Twilio (WhatsApp+SMS)
// y sigue siendo una integración de plataforma aparte usada por
// /api/mensajes/send, el motor de decisión, las automatizaciones de
// marketing y los avisos de sustituciones — no se toca aquí.

import { fetchExterno } from './fetch-externo.ts';

const API_VERSION = process.env.WHATSAPP_API_VERSION ?? 'v21.0';

export interface WhatsAppCredenciales {
  token: string;
  phoneId: string;
}

/** Envía un mensaje de texto simple por WhatsApp. `to` en formato E.164 sin '+'. */
export async function enviarWhatsAppTexto(
  creds: WhatsAppCredenciales,
  to: string,
  texto: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const destino = to.replace(/[^\d]/g, '');
  if (!destino) return { ok: false, error: 'Número de destino inválido' };
  try {
    const res = await fetchExterno(`https://graph.facebook.com/${API_VERSION}/${creds.phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${creds.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: destino, type: 'text', text: { body: texto } }),
    });
    const data = (await res.json().catch(() => null)) as { messages?: { id: string }[]; error?: { message?: string } } | null;
    if (!res.ok) return { ok: false, error: data?.error?.message ?? `WhatsApp API ${res.status}` };
    return { ok: true, id: data?.messages?.[0]?.id ?? '' };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// Plantilla HSM usada para el recordatorio de clase — un mensaje iniciado por
// el negocio (lo dispara un cron, no una respuesta a la clienta), así que
// Meta lo rechaza como `type: 'text'` fuera de la ventana de 24h desde el
// último mensaje entrante de la socia (error 131047). Cada estudio tiene que
// registrar esta plantilla EXACTA en su propia cuenta de Meta y esperar su
// aprobación — ver instrucciones en components/configuracion/tab-integraciones.tsx.
export const PLANTILLA_RECORDATORIO = { nombre: 'recordatorio_clase', idioma: 'es' } as const;

/** Envía un mensaje por plantilla HSM pre-aprobada por Meta (fuera de la ventana de 24h). */
export async function enviarWhatsAppPlantilla(
  creds: WhatsAppCredenciales,
  to: string,
  plantilla: { nombre: string; idioma: string },
  parametros: string[],
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const destino = to.replace(/[^\d]/g, '');
  if (!destino) return { ok: false, error: 'Número de destino inválido' };
  try {
    const res = await fetchExterno(`https://graph.facebook.com/${API_VERSION}/${creds.phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${creds.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: destino,
        type: 'template',
        template: {
          name: plantilla.nombre,
          language: { code: plantilla.idioma },
          components: [{ type: 'body', parameters: parametros.map(texto => ({ type: 'text', text: texto })) }],
        },
      }),
    });
    const data = (await res.json().catch(() => null)) as { messages?: { id: string }[]; error?: { message?: string } } | null;
    if (!res.ok) return { ok: false, error: data?.error?.message ?? `WhatsApp API ${res.status}` };
    return { ok: true, id: data?.messages?.[0]?.id ?? '' };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Comprobación de conexión: valida credenciales consultando el número. */
export async function probarWhatsApp(creds: WhatsAppCredenciales): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetchExterno(`https://graph.facebook.com/${API_VERSION}/${creds.phoneId}?fields=verified_name,display_phone_number`, {
      headers: { Authorization: `Bearer ${creds.token}` },
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      return { ok: false, error: data?.error?.message ?? `WhatsApp API ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Embedded Signup v4 — el onboarding automático que sustituye a pegar el
// token a mano. La propietaria autoriza en el popup de Meta, el navegador
// recibe un `code` de un solo uso (30s de validez) y ESTE módulo lo cambia
// por un token de sistema de larga duración, server-side, con el App Secret
// (nunca en el cliente). Ver META_SETUP.md para la configuración de la app
// de Meta que esto necesita (META_APP_ID/META_APP_SECRET/META_CONFIG_ID).
//
// Nota deliberada: nada de lo de aquí sustituye `enviarWhatsAppTexto/
// Plantilla/probarWhatsApp` de arriba — solo son un productor más del mismo
// `WhatsAppCredenciales{token, phoneId}` que ya consume el cron. Ver el
// comentario de cabecera de este archivo.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Cambia el `code` de Embedded Signup por un Business Integration System
 * User token — de larga duración, sin refresh_token que gestionar (a
 * diferencia de un grant OAuth2 clásico, no caduca salvo revocación manual
 * desde Meta Business Manager).
 */
export async function intercambiarCodigoWhatsApp(
  code: string,
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) return { ok: false, error: 'Meta no está configurado en este entorno' };
  try {
    const url = new URL(`https://graph.facebook.com/${API_VERSION}/oauth/access_token`);
    url.searchParams.set('client_id', appId);
    url.searchParams.set('client_secret', appSecret);
    url.searchParams.set('code', code);
    const res = await fetchExterno(url.toString());
    const data = (await res.json().catch(() => null)) as { access_token?: string; error?: { message?: string } } | null;
    if (!res.ok || !data?.access_token) return { ok: false, error: data?.error?.message ?? `WhatsApp API ${res.status}` };
    return { ok: true, token: data.access_token };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Valida — contra la Graph API real, nunca confiando en lo que mandó el
 * navegador — que el token recién obtenido de verdad da acceso al
 * phone_number_id/waba_id que Embedded Signup dijo haber conectado. Si algo
 * no cuadra (token revocado, número no perteneciente a esa cuenta), no se
 * persiste ninguna conexión a medias — el llamador decide no guardar nada.
 */
export async function validarConexionEmbeddedSignup(
  token: string,
  phoneNumberId: string,
  wabaId: string,
): Promise<
  | { ok: true; displayPhoneNumber: string | null; verifiedName: string | null }
  | { ok: false; error: string }
> {
  try {
    const [resNumero, resWaba] = await Promise.all([
      fetchExterno(`https://graph.facebook.com/${API_VERSION}/${phoneNumberId}?fields=verified_name,display_phone_number`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetchExterno(`https://graph.facebook.com/${API_VERSION}/${wabaId}?fields=id`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    ]);
    if (!resNumero.ok) {
      const data = (await resNumero.json().catch(() => null)) as { error?: { message?: string } } | null;
      return { ok: false, error: data?.error?.message ?? `WhatsApp API ${resNumero.status}` };
    }
    if (!resWaba.ok) {
      const data = (await resWaba.json().catch(() => null)) as { error?: { message?: string } } | null;
      return { ok: false, error: data?.error?.message ?? `WhatsApp API ${resWaba.status}` };
    }
    const numero = (await resNumero.json().catch(() => null)) as { verified_name?: string; display_phone_number?: string } | null;
    return {
      ok: true,
      displayPhoneNumber: numero?.display_phone_number ?? null,
      verifiedName: numero?.verified_name ?? null,
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * `POST /{WABA_ID}/subscribed_apps` — sin esto, el webhook de la app
 * (app/api/webhooks/whatsapp) nunca recibe NADA de este WABA por mucho que
 * la URL esté bien dada de alta a nivel de app: la suscripción es POR WABA,
 * no global (ver META_SETUP.md §6, flujo de Tech Provider de 5 pasos). Se
 * llama justo después de validar la conexión — un fallo aquí NO debe tumbar
 * el guardado: el número ya funciona para ENVIAR, solo se queda sin recibir
 * eventos hasta que se reintente.
 */
export async function suscribirWabaAWebhook(token: string, wabaId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetchExterno(`https://graph.facebook.com/${API_VERSION}/${wabaId}/subscribed_apps`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      return { ok: false, error: data?.error?.message ?? `WhatsApp API ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
