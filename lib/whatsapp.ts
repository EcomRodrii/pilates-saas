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
