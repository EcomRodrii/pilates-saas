import { telefonoE164 } from '@/lib/decision/mensajes-socia';

// Canal WhatsApp/SMS vía Twilio. Igual que R2 (aws4fetch) evitamos meter el SDK
// pesado: la REST API de Twilio es un POST form con Basic auth. Todo gated por
// env vars — sin ellas, el envío se salta con `skipped` y la app degrada con
// elegancia (mismo patrón que RESEND_API_KEY / STRIPE_SECRET_KEY). El usuario
// crea la cuenta Twilio y pega las credenciales; nada se rompe hasta entonces.
//
// Env:
//   TWILIO_ACCOUNT_SID     (ACxxxx…)
//   TWILIO_AUTH_TOKEN
//   TWILIO_WHATSAPP_FROM    remitente WhatsApp, formato 'whatsapp:+14155238886'
//   TWILIO_SMS_FROM         remitente SMS, formato '+1XXXXXXXXXX'

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM;
const SMS_FROM = process.env.TWILIO_SMS_FROM;

export type CanalMensaje = 'WHATSAPP' | 'SMS';

// Un valor cuenta como "sin configurar" si falta o es el placeholder de ejemplo.
function ausente(v: string | undefined): boolean {
  return !v || v.startsWith('ACXXXX') || v.startsWith('XXXX') || v.includes('XXXX');
}

/** ¿Hay credenciales para enviar por este canal? */
export function twilioConfigurado(canal: CanalMensaje): boolean {
  if (ausente(ACCOUNT_SID) || ausente(AUTH_TOKEN)) return false;
  return canal === 'WHATSAPP' ? !ausente(WHATSAPP_FROM) : !ausente(SMS_FROM);
}

export interface ResultadoMensaje {
  ok: boolean;
  id?: string;        // Message SID de Twilio
  skipped?: boolean;  // no configurado → no es un error "duro"
  error?: string;
}

/**
 * Envía un mensaje por WhatsApp o SMS. Devuelve `skipped:true` (no `ok`) si el
 * canal no está configurado, para que el llamador distinga "no hay Twilio" de
 * "Twilio falló". El teléfono se normaliza a E.164 (móvil ES → +34).
 */
export async function enviarMensajeTwilio(params: { canal: CanalMensaje; to: string | null | undefined; cuerpo: string }): Promise<ResultadoMensaje> {
  const { canal, to, cuerpo } = params;
  if (!twilioConfigurado(canal)) return { ok: false, skipped: true, error: 'Twilio no configurado para este canal' };

  const e164 = telefonoE164(to);
  if (!e164) return { ok: false, error: 'La socia no tiene un teléfono válido' };

  const from = canal === 'WHATSAPP' ? WHATSAPP_FROM! : SMS_FROM!;
  const toField = canal === 'WHATSAPP' ? `whatsapp:${e164}` : e164;

  const body = new URLSearchParams({ From: from, To: toField, Body: cuerpo });
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    if (!res.ok) {
      const detalle = await res.text().catch(() => '');
      return { ok: false, error: `Twilio ${res.status}: ${detalle.slice(0, 200)}` };
    }
    const data = (await res.json().catch(() => ({}))) as { sid?: string };
    return { ok: true, id: data.sid };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error de red con Twilio' };
  }
}
