// Adaptador de la integración Zoom (OAuth real, no un mock).
// Una sola app de Zoom para toda la plataforma (ZOOM_CLIENT_ID/SECRET) — cada
// estudio conecta su propia cuenta y sus reuniones viven en SU cuenta de
// Zoom, igual que Google Calendar/Gmail: una app, muchas cuentas conectadas.
// Antes esto era Server-to-Server OAuth (una única cuenta de Zoom para TODOS
// los estudios, gestionada por el operador) — insuficiente en cuanto una
// propietaria quiere conectar SU Zoom, no el de otra. La app de Zoom Marketplace
// tiene que ser de tipo "OAuth" (a veces llamada "General App"), NO
// "Server-to-Server OAuth" (esa es de una sola cuenta).
//
// Todo lo de este archivo corre en servidor (rutas de app/api/**). El
// access/refresh token de cada estudio vive en `integracion_credenciales`,
// una tabla sin policies de RLS para anon/authenticated — solo accesible con
// la service role key, nunca desde el navegador del estudio.

import {
  dbGetZoomCredenciales,
  dbSaveZoomCredenciales,
  type ZoomCredenciales,
} from '@/lib/supabase-data';
import { fetchExterno } from '@/lib/fetch-externo';

const TOKEN_URL = 'https://zoom.us/oauth/token';
const API_BASE = 'https://api.zoom.us/v2';

function env() {
  const clientId = process.env.NEXT_PUBLIC_ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
  return { clientId, clientSecret, appUrl, redirectUri: `${appUrl}/api/integrations/zoom/callback` };
}

export function isZoomConfigurado(): boolean {
  const { clientId, clientSecret } = env();
  return !!clientId && !!clientSecret;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  error?: string;
  reason?: string;
}

function authHeaderBasic(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
}

export async function exchangeCodeForTokens(code: string): Promise<{ accessToken: string; refreshToken: string; expiresAt: string }> {
  const { clientId, clientSecret, redirectUri } = env();
  if (!clientId || !clientSecret) throw new Error('Zoom no configurado');

  const res = await fetchExterno(TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: authHeaderBasic(clientId, clientSecret), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
  });
  const data = (await res.json()) as TokenResponse;
  if (!res.ok || !data.access_token) {
    throw new Error(data.reason ?? data.error ?? 'Zoom no devolvió un token válido');
  }
  if (!data.refresh_token) throw new Error('Zoom no devolvió un refresh token — vuelve a intentarlo');

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  };
}

async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string; expiresAt: string }> {
  const { clientId, clientSecret } = env();
  if (!clientId || !clientSecret) throw new Error('Zoom no configurado');

  const res = await fetchExterno(TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: authHeaderBasic(clientId, clientSecret), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  });
  const data = (await res.json()) as TokenResponse;
  if (!res.ok || !data.access_token) {
    throw new Error(data.reason ?? data.error ?? 'No se pudo renovar el token de Zoom');
  }
  // A diferencia de Google, Zoom ROTA el refresh_token en cada renovación — si
  // no guardamos el nuevo, la siguiente renovación falla con el viejo ya
  // invalidado. Si por lo que sea no viniera uno nuevo, reusamos el actual.
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  };
}

// Devuelve un access token válido para el estudio, renovándolo primero si ya
// venció (con margen de 60s). null si el estudio no tiene Zoom conectado.
export async function getValidAccessToken(studioId: string): Promise<string | null> {
  const creds = await dbGetZoomCredenciales(studioId);
  if (!creds) return null;

  const vigente = new Date(creds.expiresAt).getTime() - 60_000 > Date.now();
  if (vigente) return creds.accessToken;

  const renovado = await refreshAccessToken(creds.refreshToken);
  const nuevasCreds: ZoomCredenciales = { accessToken: renovado.accessToken, refreshToken: renovado.refreshToken, expiresAt: renovado.expiresAt };
  await dbSaveZoomCredenciales(studioId, nuevasCreds);
  return renovado.accessToken;
}

export async function getZoomAccountEmail(accessToken: string): Promise<string | null> {
  const res = await fetchExterno(`${API_BASE}/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.email ?? null;
}

/** Crea una reunión de Zoom en la cuenta del estudio conectado; devuelve el enlace de acceso. */
export async function crearReunionZoom(
  accessToken: string,
  tema: string,
  inicioISO: string,
  duracionMin: number,
): Promise<{ ok: true; joinUrl: string; id: number } | { ok: false; error: string }> {
  const res = await fetchExterno(`${API_BASE}/users/me/meetings`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic: tema.slice(0, 200), type: 2, start_time: inicioISO, duration: duracionMin, timezone: 'Europe/Madrid' }),
  });
  const data = (await res.json().catch(() => null)) as { id?: number; join_url?: string; message?: string } | null;
  if (!res.ok || !data?.join_url) return { ok: false, error: data?.message ?? `Zoom API ${res.status}` };
  return { ok: true, joinUrl: data.join_url, id: data.id ?? 0 };
}

export async function probarZoom(studioId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = await getValidAccessToken(studioId);
  if (!token) return { ok: false, error: 'Zoom no conectado' };
  const res = await fetchExterno(`${API_BASE}/users/me`, { headers: { Authorization: `Bearer ${token}` } });
  return res.ok ? { ok: true } : { ok: false, error: `Zoom API ${res.status}` };
}
