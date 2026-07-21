// Adaptador de la integración Gmail (OAuth real, mismo patrón que
// lib/google-calendar.ts — una sola app de Google para toda la plataforma,
// cada estudio conecta su propia cuenta). Dos capacidades:
//   1. Enviar emails desde el Gmail de la propietaria (en vez del Resend de
//      plataforma), vía la Gmail API.
//   2. Traer sus contactos como clientas nuevas, vía la People API.
//
// Todo esto corre en servidor (rutas de app/api/**). El token vive en
// `integracion_credenciales` con provider='gmail' — misma tabla que Google
// Calendar (provider='google_calendar'), sin RLS para anon/authenticated,
// solo accesible con la service role key.

import {
  dbGetGmailCredenciales,
  dbSaveGmailCredenciales,
  type GmailCredenciales,
} from '@/lib/supabase-data';
import { fetchExterno } from '@/lib/fetch-externo';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1';
const PEOPLE_API = 'https://people.googleapis.com/v1';
// El scope se construye en el cliente (conectarGmail en tab-integraciones.tsx),
// igual que hace Google Calendar — aquí solo hace falta para el intercambio
// de tokens y las llamadas a la API, que no dependen del scope pedido.

function env() {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
  return { clientId, clientSecret, appUrl, redirectUri: `${appUrl}/api/integrations/gmail/callback` };
}

export function isGmailConfigurado(): boolean {
  const { clientId, clientSecret } = env();
  return !!clientId && !!clientSecret;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
  error?: string;
  error_description?: string;
}

export async function exchangeCodeForTokens(code: string): Promise<{ accessToken: string; refreshToken: string; expiresAt: string }> {
  const { clientId, clientSecret, redirectUri } = env();
  if (!clientId || !clientSecret) throw new Error('Gmail no configurado');

  const res = await fetchExterno(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const data = (await res.json()) as TokenResponse;
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description ?? data.error ?? 'Google no devolvió un token válido');
  }
  // Mismo motivo que Calendar: si el estudio ya había conectado antes y
  // reconecta, el refresh_token puede venir vacío; por eso pedimos
  // `prompt=consent` siempre, que fuerza a Google a remandarlo.
  if (!data.refresh_token) throw new Error('Google no devolvió un refresh token — revoca el acceso en tu cuenta de Google y vuelve a intentarlo');

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  };
}

async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: string }> {
  const { clientId, clientSecret } = env();
  if (!clientId || !clientSecret) throw new Error('Gmail no configurado');

  const res = await fetchExterno(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = (await res.json()) as TokenResponse;
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description ?? data.error ?? 'No se pudo renovar el token de Gmail');
  }
  return { accessToken: data.access_token, expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString() };
}

// Devuelve un access token válido para el estudio, renovándolo primero si ya
// venció (con margen de 60s). null si el estudio no tiene Gmail conectado.
export async function getValidAccessToken(studioId: string): Promise<string | null> {
  const creds = await dbGetGmailCredenciales(studioId);
  if (!creds) return null;

  const vigente = new Date(creds.expiresAt).getTime() - 60_000 > Date.now();
  if (vigente) return creds.accessToken;

  const renovado = await refreshAccessToken(creds.refreshToken);
  const nuevasCreds: GmailCredenciales = { accessToken: renovado.accessToken, refreshToken: creds.refreshToken, expiresAt: renovado.expiresAt };
  await dbSaveGmailCredenciales(studioId, nuevasCreds);
  return renovado.accessToken;
}

export async function getGoogleAccountEmail(accessToken: string): Promise<string | null> {
  const res = await fetchExterno('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.email ?? null;
}

// Codifica un email en el formato "raw" que exige la Gmail API: MIME
// básico, base64url (Google no acepta el base64 normal — hay que cambiar
// +/ por -_ y quitar el padding).
function construirMimeBase64Url(opts: { to: string; from: string; asunto: string; cuerpo: string }): string {
  const mime = [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    `Subject: =?UTF-8?B?${Buffer.from(opts.asunto, 'utf-8').toString('base64')}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    opts.cuerpo,
  ].join('\r\n');
  return Buffer.from(mime, 'utf-8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Envía un email desde el Gmail conectado del estudio. */
export async function enviarEmailGmail(
  accessToken: string,
  opts: { from: string; to: string; asunto: string; cuerpo: string },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const raw = construirMimeBase64Url(opts);
  const res = await fetchExterno(`${GMAIL_API}/users/me/messages/send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw }),
  });
  const data = await res.json().catch(() => null) as { id?: string; error?: { message?: string } } | null;
  if (!res.ok || !data?.id) return { ok: false, error: data?.error?.message ?? 'No se pudo enviar el email con Gmail' };
  return { ok: true, id: data.id };
}

export interface ContactoGmail {
  nombre: string;
  apellidos: string;
  email: string;
}

/**
 * Trae los contactos con email de la libreta de Google del estudio. Se pide
 * una sola página de hasta 1000 (el máximo que admite la People API): cubre
 * casi cualquier libreta real de un negocio y evita construir paginación
 * para un caso límite que no se ha pedido.
 */
export async function listarContactosGmail(accessToken: string): Promise<ContactoGmail[]> {
  const params = new URLSearchParams({ personFields: 'names,emailAddresses', pageSize: '1000' });
  const res = await fetchExterno(`${PEOPLE_API}/people/me/connections?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(data?.error?.message ?? 'No se pudieron leer los contactos de Google');
  }
  const data = await res.json() as {
    connections?: {
      names?: { givenName?: string; familyName?: string; displayName?: string }[];
      emailAddresses?: { value?: string }[];
    }[];
  };
  const contactos: ContactoGmail[] = [];
  for (const c of data.connections ?? []) {
    const email = c.emailAddresses?.[0]?.value?.trim().toLowerCase();
    if (!email) continue; // sin email no hay forma de identificarlo como clienta única
    const n = c.names?.[0];
    // People API da nombre/apellido por separado cuando el contacto los tiene
    // estructurados; si no, solo hay displayName (p.ej. "Estudio Pilates SL").
    contactos.push({
      nombre: n?.givenName?.trim() || n?.displayName?.trim() || email,
      apellidos: n?.familyName?.trim() || '',
      email,
    });
  }
  return contactos;
}
