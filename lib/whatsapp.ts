// WhatsApp Business — Meta Cloud API (integración de plataforma).
// Secretos por ENV del operador (no per-estudio): WHATSAPP_TOKEN + WHATSAPP_PHONE_ID.
// El estudio activa el uso desde Configuración → Integraciones (fila `activo`).

const TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const API_VERSION = process.env.WHATSAPP_API_VERSION ?? 'v21.0';

export function isWhatsAppConfigurado(): boolean {
  return !!(TOKEN && PHONE_ID);
}

/** Envía un mensaje de texto simple por WhatsApp. `to` en formato E.164 sin '+'. */
export async function enviarWhatsAppTexto(
  to: string,
  texto: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!isWhatsAppConfigurado()) return { ok: false, error: 'WhatsApp no configurado (faltan WHATSAPP_TOKEN / WHATSAPP_PHONE_ID)' };
  const destino = to.replace(/[^\d]/g, '');
  if (!destino) return { ok: false, error: 'Número de destino inválido' };
  try {
    const res = await fetch(`https://graph.facebook.com/${API_VERSION}/${PHONE_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: destino, type: 'text', text: { body: texto } }),
    });
    const data = (await res.json().catch(() => null)) as { messages?: { id: string }[]; error?: { message?: string } } | null;
    if (!res.ok) return { ok: false, error: data?.error?.message ?? `WhatsApp API ${res.status}` };
    return { ok: true, id: data?.messages?.[0]?.id ?? '' };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Comprobación de conexión: valida credenciales consultando el número. */
export async function probarWhatsApp(): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isWhatsAppConfigurado()) return { ok: false, error: 'Faltan WHATSAPP_TOKEN / WHATSAPP_PHONE_ID' };
  try {
    const res = await fetch(`https://graph.facebook.com/${API_VERSION}/${PHONE_ID}?fields=verified_name,display_phone_number`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
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
