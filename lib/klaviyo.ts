// Adaptador de la integración Klaviyo (OAuth real). Paso 7 de
// docs/marketing-integrations-arquitectura.md §6/§8 — primer proveedor
// externo del Marketing Hub. Mismo patrón que lib/google-calendar.ts: una
// sola app de Klaviyo para toda la plataforma (KLAVIYO_CLIENT_ID/SECRET),
// cada estudio conecta su propia cuenta (BYO account — Tentare no crea
// cuentas de Klaviyo) y sus tokens viven en `integracion_credenciales`
// (provider='klaviyo'), sin policies de RLS para anon/authenticated.
//
// Diferencia real con Google/Zoom: Klaviyo exige PKCE desde 2025 (bloquea el
// flujo sin él) — ver lib/oauth-state.ts, que lleva el code_verifier dentro
// del propio `state` firmado.
//
// ⚠️ NO VERIFICADO end-to-end: sin KLAVIYO_CLIENT_ID/SECRET reales (hay que
// registrar una app OAuth en developers.klaviyo.com, algo que solo puede
// hacer Marcos), este código nunca ha hablado con la Klaviyo real. Los
// endpoints/campos están tomados de la documentación oficial de Klaviyo
// (developers.klaviyo.com), no de una prueba en vivo — mismo tipo de
// limitación que Stripe Fase 3 ("construido, no probado con un cobro real").

import {
  dbGetKlaviyoCredenciales,
  dbSaveKlaviyoCredenciales,
  type KlaviyoCredenciales,
} from './db/supabase-data-admin.ts';
import { fetchExterno } from './fetch-externo.ts';

// generarPkce vive en lib/marketing/pkce.ts (sin dependencias, testable con
// node --test) — este archivo no la necesita: la generación de PKCE ocurre
// en app/api/integrations/oauth-state/route.ts, no aquí.

const AUTHORIZE_URL = 'https://www.klaviyo.com/oauth/authorize';
const TOKEN_URL = 'https://a.klaviyo.com/oauth/token';
const REVOKE_URL = 'https://a.klaviyo.com/oauth/revoke';
const API_BASE = 'https://a.klaviyo.com/api';
// Klaviyo versiona su API por fecha, no por número — hay que fijarla o un
// cambio de "revisión por defecto" del lado de Klaviyo podría alterar
// silenciosamente la forma de la respuesta.
const API_REVISION = '2026-07-15';

// accounts:read → identificar la cuenta conectada (nombre para la UI).
// lists:write → crear la lista "Tentare — Marketing" en el primer connect.
// profiles:write + subscriptions:write → el propio envío de sincronización.
const SCOPES = 'accounts:read lists:write profiles:write subscriptions:write';

// client_id no es secreto (viaja en la URL de autorización que ve el
// navegador) — mismo criterio que NEXT_PUBLIC_GOOGLE_CLIENT_ID en
// lib/google-calendar.ts: una sola env var, leída tanto en servidor (aquí)
// como en cliente (components/configuracion/tab-integraciones.tsx), para
// que nunca puedan desincronizarse.
function env() {
  const clientId = process.env.NEXT_PUBLIC_KLAVIYO_CLIENT_ID;
  const clientSecret = process.env.KLAVIYO_CLIENT_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
  return { clientId, clientSecret, appUrl, redirectUri: `${appUrl}/api/integrations/klaviyo/callback` };
}

export function isKlaviyoConfigurado(): boolean {
  const { clientId, clientSecret } = env();
  return !!clientId && !!clientSecret;
}

export function authorizeUrl(state: string, codeChallenge: string): string | null {
  const { clientId, redirectUri } = env();
  if (!clientId) return null;
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: SCOPES,
    state,
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

export async function exchangeCodeForTokens(code: string, codeVerifier: string): Promise<{ accessToken: string; refreshToken: string; expiresAt: string }> {
  const { clientId, clientSecret, redirectUri } = env();
  if (!clientId || !clientSecret) throw new Error('Klaviyo no configurado');

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetchExterno(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${basic}` },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
    }),
  });
  const data = (await res.json()) as TokenResponse;
  if (!res.ok || !data.access_token || !data.refresh_token) {
    throw new Error(data.error_description ?? data.error ?? 'Klaviyo no devolvió un token válido');
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  };
}

async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: string }> {
  const { clientId, clientSecret } = env();
  if (!clientId || !clientSecret) throw new Error('Klaviyo no configurado');

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetchExterno(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${basic}` },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  });
  const data = (await res.json()) as TokenResponse;
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description ?? data.error ?? 'No se pudo renovar el token de Klaviyo');
  }
  return { accessToken: data.access_token, expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString() };
}

// Mismo criterio que revocarToken en google-calendar.ts: best-effort, nunca
// bloquea la desconexión local (que es la parte que sí depende de nosotros).
export async function revocarToken(token: string): Promise<void> {
  const { clientId, clientSecret } = env();
  if (!clientId || !clientSecret) return;
  try {
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    await fetchExterno(REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${basic}` },
      body: new URLSearchParams({ token }),
    });
  } catch (e) {
    console.error('[klaviyo] revocarToken:', e instanceof Error ? e.message : e);
  }
}

// Devuelve un access token válido para el estudio, renovándolo primero si ya
// venció (margen de 60s, mismo criterio que Google Calendar). null si el
// estudio no tiene Klaviyo conectado.
export async function getValidAccessToken(studioId: string): Promise<string | null> {
  const creds = await dbGetKlaviyoCredenciales(studioId);
  if (!creds) return null;

  const vigente = new Date(creds.expiresAt).getTime() - 60_000 > Date.now();
  if (vigente) return creds.accessToken;

  const renovado = await refreshAccessToken(creds.refreshToken);
  const nuevasCreds: KlaviyoCredenciales = { accessToken: renovado.accessToken, refreshToken: creds.refreshToken, expiresAt: renovado.expiresAt, listId: creds.listId };
  await dbSaveKlaviyoCredenciales(studioId, nuevasCreds);
  return renovado.accessToken;
}

function headers(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/vnd.api+json',
    revision: API_REVISION,
  };
}

// Nombre de la cuenta de Klaviyo conectada — solo para pintar la card en
// Configuración → Integraciones (mismo propósito que googleCalendarEmail).
export async function getAccountName(accessToken: string): Promise<string | null> {
  const res = await fetchExterno(`${API_BASE}/accounts`, { headers: headers(accessToken) });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.data?.[0]?.attributes?.contact_information?.organization_name ?? null;
}

// Lista donde caen las socias sincronizadas — se crea UNA vez por estudio en
// el primer connect (idempotente: si ya existe listId guardado, se reutiliza,
// nunca se crea una segunda).
export async function crearListaMarketing(accessToken: string): Promise<string> {
  const res = await fetchExterno(`${API_BASE}/lists`, {
    method: 'POST',
    headers: headers(accessToken),
    body: JSON.stringify({ data: { type: 'list', attributes: { name: 'Tentare — Marketing' } } }),
  });
  const data = await res.json();
  if (!res.ok || !data?.data?.id) throw new Error(data?.errors?.[0]?.detail ?? 'No se pudo crear la lista en Klaviyo');
  return data.data.id as string;
}

export interface PerfilSincronizar {
  email: string;
  nombre: string;
  telefono: string | null;
}

// Suscribe un lote de socias (ya filtradas por consentimiento vigente antes
// de llegar aquí — ver lib/inngest/klaviyo-sync.ts) a la lista del estudio.
// consent: 'SUBSCRIBED' explícito porque el filtrado de consentimiento YA
// pasó — Klaviyo no vuelve a pedir opt-in, confía en lo que le mandamos.
// Máximo 1000 perfiles por lote (límite de la API).
export async function suscribirPerfiles(accessToken: string, listId: string, perfiles: PerfilSincronizar[]): Promise<void> {
  if (perfiles.length === 0) return;
  const res = await fetchExterno(`${API_BASE}/profile-subscription-bulk-create-jobs`, {
    method: 'POST',
    headers: headers(accessToken),
    body: JSON.stringify({
      data: {
        type: 'profile-subscription-bulk-create-job',
        attributes: {
          custom_source: 'Tentare — consentimiento de marketing',
          historical_import: true,
          profiles: {
            data: perfiles.map(p => ({
              type: 'profile',
              attributes: {
                email: p.email,
                ...(p.telefono ? { phone_number: p.telefono } : {}),
                subscriptions: { email: { marketing: { consent: 'SUBSCRIBED' } } },
              },
            })),
          },
        },
        relationships: { list: { data: { type: 'list', id: listId } } },
      },
    }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.errors?.[0]?.detail ?? 'Klaviyo rechazó la sincronización de perfiles');
  }
}
