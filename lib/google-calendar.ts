// Adaptador de la integración Google Calendar (OAuth real, no un mock).
// Una sola app de Google para toda la plataforma (GOOGLE_CLIENT_ID/SECRET) —
// cada estudio conecta su propia cuenta y sus eventos viven en SU calendario,
// igual que Stripe Connect: una app, miles de cuentas conectadas.
//
// Todo lo de este archivo corre en servidor (rutas de app/api/**). El
// access/refresh token de cada estudio vive en `integracion_credenciales`,
// una tabla sin policies de RLS para anon/authenticated — solo accesible con
// la service role key, nunca desde el navegador del estudio.

import {
  dbGetGoogleCalendarCredenciales,
  dbSaveGoogleCalendarCredenciales,
  type GoogleCalendarCredenciales,
} from '@/lib/supabase-data';
import { fetchExterno } from '@/lib/fetch-externo';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

function env() {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
  return { clientId, clientSecret, appUrl, redirectUri: `${appUrl}/api/integrations/google-calendar/callback` };
}

export function isGoogleCalendarConfigurado(): boolean {
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
  if (!clientId || !clientSecret) throw new Error('Google Calendar no configurado');

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
  // La primera respuesta es la única vez que Google manda refresh_token —
  // si el estudio ya había conectado antes y reconecta, puede venir vacío;
  // por eso pedimos `prompt=consent` siempre, que fuerza a Google a remandarlo.
  if (!data.refresh_token) throw new Error('Google no devolvió un refresh token — revoca el acceso en tu cuenta de Google y vuelve a intentarlo');

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  };
}

async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: string }> {
  const { clientId, clientSecret } = env();
  if (!clientId || !clientSecret) throw new Error('Google Calendar no configurado');

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
    throw new Error(data.error_description ?? data.error ?? 'No se pudo renovar el token de Google');
  }
  return { accessToken: data.access_token, expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString() };
}

// Al desconectar, no basta con borrar la fila local: si el token ya se
// hubiera filtrado por otra vía (log, backup expuesto), seguiría siendo
// válido en Google indefinidamente. Revocar un refresh token invalida
// también los access tokens que salieron de él. Best-effort: si Google no
// responde, no debe bloquear la desconexión local (que es la parte que SÍ
// depende de nosotros).
export async function revocarToken(token: string): Promise<void> {
  try {
    await fetchExterno(REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }),
    });
  } catch (e) {
    console.error('[google-calendar] revocarToken:', e instanceof Error ? e.message : e);
  }
}

// Devuelve un access token válido para el estudio, renovándolo primero si ya
// venció (con margen de 60s). null si el estudio no tiene Google conectado.
export async function getValidAccessToken(studioId: string): Promise<string | null> {
  const creds = await dbGetGoogleCalendarCredenciales(studioId);
  if (!creds) return null;

  const vigente = new Date(creds.expiresAt).getTime() - 60_000 > Date.now();
  if (vigente) return creds.accessToken;

  const renovado = await refreshAccessToken(creds.refreshToken);
  const nuevasCreds: GoogleCalendarCredenciales = { accessToken: renovado.accessToken, refreshToken: creds.refreshToken, expiresAt: renovado.expiresAt };
  await dbSaveGoogleCalendarCredenciales(studioId, nuevasCreds);
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

interface EventoClase {
  id: string;
  titulo: string;
  descripcion: string;
  inicio: string;
  fin: string;
  googleEventId: string | null;
}

// Crea o actualiza el evento de una clase en el calendario primario del
// estudio conectado. Devuelve el id del evento de Google (guárdalo en
// `sesiones.google_event_id` para no duplicarlo en la próxima sincronización).
export async function upsertEventoClase(accessToken: string, ev: EventoClase): Promise<string> {
  const body = {
    summary: ev.titulo,
    description: ev.descripcion,
    start: { dateTime: ev.inicio },
    end: { dateTime: ev.fin },
  };
  const url = ev.googleEventId
    ? `${CALENDAR_API}/calendars/primary/events/${ev.googleEventId}`
    : `${CALENDAR_API}/calendars/primary/events`;
  const res = await fetchExterno(url, {
    method: ev.googleEventId ? 'PATCH' : 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? 'Error al crear/actualizar el evento en Google Calendar');
  return data.id as string;
}

export async function eliminarEventoClase(accessToken: string, googleEventId: string): Promise<void> {
  const res = await fetchExterno(`${CALENDAR_API}/calendars/primary/events/${googleEventId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  // 410 Gone = ya estaba borrado en Google — no es un fallo real de nuestro lado.
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error?.message ?? 'Error al borrar el evento en Google Calendar');
  }
}
