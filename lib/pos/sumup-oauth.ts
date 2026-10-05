import 'server-only';
import { fetchExterno } from '@/lib/fetch-externo';
import { dbGetSumupCredenciales, dbRenovarSumupCredenciales } from '@/lib/db/supabase-data-admin';
import { obtenerTokenSumup, type TokenSumup, type TokensSumup, type ResultadoRenovacion } from './sumup-token.ts';
import { SCOPES_SUMUP } from './sumup.ts';

export type { TokenSumup } from './sumup-token.ts';
import { RUTA_CALLBACK_OAUTH } from '@/lib/oauth-state';

// ─────────────────────────────────────────────────────────────────────────────
// La cuenta de SumUp del estudio (OAuth 2.0 de SumUp para plataformas).
//
// La conecta la dueña desde Configuración; con ella Tentare empareja su Solo y le
// manda cobros. El dinero va a la cuenta de SumUp del estudio, no pasa por Tentare.
//
// La renovación del token (que ROTA, con carreras) está en sumup-token.ts.
// ─────────────────────────────────────────────────────────────────────────────

const AUTORIZAR_URL = 'https://api.sumup.com/authorize';
const TOKEN_URL = 'https://api.sumup.com/token';
const PERFIL_URL = 'https://api.sumup.com/v0.1/me';


function config() {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001').replace(/\/$/, '');
  return {
    clientId: process.env.SUMUP_CLIENT_ID ?? '',
    clientSecret: process.env.SUMUP_CLIENT_SECRET ?? '',
    redirectUri: `${appUrl}${RUTA_CALLBACK_OAUTH.sumup}`,
  };
}

/** ¿Tiene Tentare dada de alta su app en SumUp? Sin ella, SumUp no se ofrece. */
export function sumupConfigurado(): boolean {
  const c = config();
  return !!c.clientId && !!c.clientSecret;
}

export function urlAutorizarSumup(state: string): string {
  const c = config();
  const q = new URLSearchParams({
    response_type: 'code', client_id: c.clientId, redirect_uri: c.redirectUri,
    scope: SCOPES_SUMUP.join(' '), state,
  });
  return `${AUTORIZAR_URL}?${q.toString()}`;
}

interface RespuestaToken { access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string }

/** Lo que devuelve el endpoint de token, o el motivo. `invalid_grant` se distingue: es reconectar. */
async function pedirToken(cuerpo: Record<string, string>): Promise<ResultadoRenovacion> {
  const c = config();
  if (!c.clientId || !c.clientSecret) return { ok: false, invalidGrant: false, error: 'SumUp no configurado' };
  const res = await fetchExterno(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ ...cuerpo, client_id: c.clientId, client_secret: c.clientSecret }),
  });
  const d = (await res.json().catch(() => ({}))) as RespuestaToken;
  if (!res.ok || !d.access_token || !d.refresh_token) {
    return { ok: false, invalidGrant: d.error === 'invalid_grant', error: d.error_description ?? d.error ?? `SumUp respondió ${res.status}` };
  }
  return {
    ok: true,
    tokens: {
      accessToken: d.access_token, refreshToken: d.refresh_token,
      expiresAt: new Date(Date.now() + (Number(d.expires_in) || 3600) * 1000).toISOString(),
    },
  };
}

export async function canjearCodigoSumup(code: string): Promise<TokensSumup> {
  const r = await pedirToken({ grant_type: 'authorization_code', code, redirect_uri: config().redirectUri });
  if (!r.ok) throw new Error(`SumUp no devolvió un token válido: ${r.error}`);
  return r.tokens;
}

/**
 * El `merchant_code` de la cuenta que acaba de autorizar (va en todas las rutas de
 * su API) y el nombre del comercio, para enseñar QUÉ cuenta quedó conectada.
 */
export async function perfilSumup(accessToken: string): Promise<{ merchantCode: string; nombreComercio: string | null }> {
  const res = await fetchExterno(PERFIL_URL, { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } });
  const d = (await res.json().catch(() => ({}))) as {
    merchant_profile?: { merchant_code?: unknown; company_name?: unknown; business_name?: unknown; doing_business_as?: { business_name?: unknown } };
  };
  const p = d.merchant_profile;
  const mc = p?.merchant_code;
  if (!res.ok || typeof mc !== 'string' || !mc) throw new Error('SumUp no devolvió el código de comercio de la cuenta');
  const nombre = [p?.doing_business_as?.business_name, p?.business_name, p?.company_name]
    .find((v): v is string => typeof v === 'string' && v.trim() !== '');
  return { merchantCode: mc, nombreComercio: nombre?.trim().slice(0, 120) ?? null };
}

/**
 * Un access token vigente de la cuenta de SumUp del estudio. La lógica (y sus
 * carreras) vive en sumup-token.ts; aquí, de dónde se lee y dónde se guarda.
 */
export function tokenSumup(studioId: string): Promise<TokenSumup> {
  return obtenerTokenSumup(studioId, {
    leer: dbGetSumupCredenciales,
    guardarRenovado: dbRenovarSumupCredenciales,
    renovarEnSumup: refreshToken => pedirToken({ grant_type: 'refresh_token', refresh_token: refreshToken }),
    ahora: () => Date.now(),
  });
}
