// Mailchimp — email marketing. Cada estudio pega su PROPIA clave API de
// Mailchimp (su propia cuenta, BYO account — Tentare no crea ni paga
// cuentas de Mailchimp) en Configuración → Integraciones — no hay cuenta
// compartida de plataforma. Mismo criterio que Kisi (lib/kisi.ts): sin
// OAuth, clave API generada a mano desde el propio panel de Mailchimp,
// guardada en la tabla `integraciones` (studio_id, tipo='MAILCHIMP',
// config jsonb), no en `integracion_credenciales` (esa es solo para
// proveedores OAuth como Klaviyo/Google/Zoom).
//
// La API de Mailchimp exige el "server prefix" (el datacenter de la cuenta,
// p.ej. "us6") para saber contra qué URL hablar — la propietaria lo copia
// de su propia URL de panel o de la cola de su clave API (siempre termina
// en "-usN"), lo pega como un campo más.

import { createHash } from 'crypto';
import { fetchExterno } from './fetch-externo.ts';

export interface MailchimpCredenciales {
  apiKey: string;
  audienceId: string;
  serverPrefix: string;
}

function apiBase(serverPrefix: string): string {
  return `https://${serverPrefix}.api.mailchimp.com/3.0`;
}

function headers(creds: MailchimpCredenciales): HeadersInit {
  const basic = Buffer.from(`anystring:${creds.apiKey}`).toString('base64');
  return { Authorization: `Basic ${basic}`, 'Content-Type': 'application/json' };
}

export async function probarMailchimp(creds: MailchimpCredenciales): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetchExterno(`${apiBase(creds.serverPrefix)}/ping`, { headers: headers(creds) });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { detail?: string } | null;
      return { ok: false, error: data?.detail ?? `Mailchimp API ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export interface PerfilSincronizar {
  email: string;
  nombre: string;
  telefono: string | null;
}

function subscriberHash(email: string): string {
  return createHash('md5').update(email.trim().toLowerCase()).digest('hex');
}

// Sube (o actualiza) un lote de socias — ya filtradas por consentimiento
// vigente antes de llegar aquí, mismo guard que campañas/automatizaciones.
// PUT idempotente por socia (upsert por subscriber_hash): sin endpoint de
// bulk síncrono real en la API de Mailchimp (el oficial es asíncrono con
// polling), aceptable para el volumen de un estudio. Solo `status_if_new`,
// nunca `status`: si la socia ya existe en Mailchimp con una baja manual,
// este PUT no la vuelve a suscribir por encima de esa baja.
export async function suscribirPerfiles(creds: MailchimpCredenciales, perfiles: PerfilSincronizar[]): Promise<{ sincronizadas: number; errores: number }> {
  let sincronizadas = 0;
  let errores = 0;
  for (const p of perfiles) {
    const hash = subscriberHash(p.email);
    try {
      const res = await fetchExterno(`${apiBase(creds.serverPrefix)}/lists/${creds.audienceId}/members/${hash}`, {
        method: 'PUT',
        headers: headers(creds),
        body: JSON.stringify({
          email_address: p.email,
          status_if_new: 'subscribed',
        }),
      });
      if (res.ok) sincronizadas++; else errores++;
    } catch {
      errores++;
    }
  }
  return { sincronizadas, errores };
}
