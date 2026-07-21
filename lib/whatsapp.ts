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
    const res = await fetch(`https://graph.facebook.com/${API_VERSION}/${creds.phoneId}/messages`, {
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

/** Comprobación de conexión: valida credenciales consultando el número. */
export async function probarWhatsApp(creds: WhatsAppCredenciales): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(`https://graph.facebook.com/${API_VERSION}/${creds.phoneId}?fields=verified_name,display_phone_number`, {
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
