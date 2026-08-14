import type { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { uid } from '@/lib/utils';
import {
  generarTokenAleatorio, sha256Hex, compararEnTiempoConstante, verificarPkce,
  type ScopeOAuth,
} from '@/lib/oauth-crypto';

// Servidor OAuth 2.0 para aplicaciones de terceros (Zapier) — Fases 0-4.
// Ver docs/oauth-arquitectura.md para el diseño completo.
//
// Estas tablas NO tienen política RLS para anon/authenticated (mismo patrón
// que integracion_credenciales): todo acceso pasa por aquí, con service-role,
// y CADA función filtra manualmente por studio_id/cliente_id — igual que
// documenta lib/auth-server.ts sobre por qué RLS no ayuda bajo service-role.

const TTL_CODIGO_MS = 10 * 60 * 1000; // 10 min
const TTL_ACCESS_MS = 60 * 60 * 1000; // 1h
const TTL_REFRESH_MS = 90 * 24 * 60 * 60 * 1000; // 90 días

export interface ClienteOAuth {
  id: string;
  nombre: string;
  descripcion: string | null;
  clientSecretHash: string;
  redirectUris: string[];
  esConfidencial: boolean;
  logoUrl: string | null;
  activo: boolean;
}

export async function buscarClienteOAuth(admin: SupabaseClient, clienteId: string): Promise<ClienteOAuth | null> {
  const { data } = await admin
    .from('oauth_clientes')
    .select('id, nombre, descripcion, client_secret_hash, redirect_uris, es_confidencial, logo_url, activo')
    .eq('id', clienteId)
    .eq('activo', true)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id, nombre: data.nombre, descripcion: data.descripcion,
    clientSecretHash: data.client_secret_hash, redirectUris: data.redirect_uris ?? [],
    esConfidencial: data.es_confidencial, logoUrl: data.logo_url, activo: data.activo,
  };
}

// Whitelist ESTRICTA: coincidencia exacta, nunca por prefijo — un
// redirect_uri parcial abriría la puerta a exfiltrar el code a un dominio
// distinto con el mismo prefijo.
export function redirectUriPermitida(cliente: ClienteOAuth, redirectUri: string): boolean {
  return cliente.redirectUris.includes(redirectUri);
}

export function verificarClientSecret(cliente: ClienteOAuth, secretRecibido: string): boolean {
  return compararEnTiempoConstante(sha256Hex(secretRecibido), cliente.clientSecretHash);
}

// ─── Authorization code ──────────────────────────────────────────────────────

export interface CrearCodigoParams {
  studioId: string;
  clienteId: string;
  authUserId: string;
  scopes: ScopeOAuth[];
  redirectUri: string;
  codeChallenge: string;
}

export async function crearCodigoAutorizacion(admin: SupabaseClient, p: CrearCodigoParams): Promise<string> {
  const codigo = generarTokenAleatorio();
  const cadenaId = uid();
  const expiraEn = new Date(Date.now() + TTL_CODIGO_MS).toISOString();
  await admin.from('oauth_codigos_autorizacion').insert({
    codigo, studio_id: p.studioId, cliente_id: p.clienteId, auth_user_id: p.authUserId,
    scopes: p.scopes, redirect_uri: p.redirectUri, code_challenge: p.codeChallenge,
    code_challenge_method: 'S256', cadena_id: cadenaId, expira_en: expiraEn,
  });
  return codigo;
}

export type CanjeCodigoResultado =
  | { ok: true; studioId: string; clienteId: string; authUserId: string; scopes: ScopeOAuth[]; cadenaId: string }
  | { ok: false; error: 'invalid_grant'; motivo: 'no_existe' | 'expirado' | 'reutilizado' | 'redirect_uri_no_coincide' | 'pkce_invalido' | 'cliente_no_coincide' };

// Canjea un authorization code por su contenido, con:
//  - detección de REUSE (RFC 6749 §10.5): si `usado_en` ya no es NULL, alguien
//    está reintentando un code ya canjeado — se revoca TODA la cadena de
//    tokens nacida de él (podría ser un atacante con el code interceptado).
//  - verificación de redirect_uri EXACTA, de PKCE (S256) y de que el code
//    pertenece al cliente que se está autenticando (`clienteEsperado`) —
//    comprobado ANTES de marcar `usado_en`, para que un cliente distinto no
//    pueda "quemar" el code de otra app solo con conocer code+code_verifier.
export async function canjearCodigoAutorizacion(
  admin: SupabaseClient, codigo: string, redirectUri: string, codeVerifier: string, clienteEsperado: string,
): Promise<CanjeCodigoResultado> {
  const { data: fila } = await admin
    .from('oauth_codigos_autorizacion')
    .select('*')
    .eq('codigo', codigo)
    .maybeSingle();

  if (!fila) return { ok: false, error: 'invalid_grant', motivo: 'no_existe' };

  if (fila.usado_en) {
    await revocarCadena(admin, fila.cadena_id);
    return { ok: false, error: 'invalid_grant', motivo: 'reutilizado' };
  }

  if (new Date(fila.expira_en).getTime() < Date.now()) {
    return { ok: false, error: 'invalid_grant', motivo: 'expirado' };
  }

  if (fila.cliente_id !== clienteEsperado) {
    return { ok: false, error: 'invalid_grant', motivo: 'cliente_no_coincide' };
  }

  if (fila.redirect_uri !== redirectUri) {
    return { ok: false, error: 'invalid_grant', motivo: 'redirect_uri_no_coincide' };
  }

  if (!verificarPkce(codeVerifier, fila.code_challenge)) {
    return { ok: false, error: 'invalid_grant', motivo: 'pkce_invalido' };
  }

  // Marcar usado ANTES de devolver éxito — si dos canjes concurrentes llegan
  // aquí a la vez, el UPDATE condicionado por `usado_en is null` hace que
  // solo uno gane la carrera; el perdedor recibe 0 filas afectadas y se trata
  // como reuse (más estricto que una simple lectura-luego-escritura).
  const { data: actualizado } = await admin
    .from('oauth_codigos_autorizacion')
    .update({ usado_en: new Date().toISOString() })
    .eq('codigo', codigo)
    .is('usado_en', null)
    .select('codigo')
    .maybeSingle();

  if (!actualizado) {
    await revocarCadena(admin, fila.cadena_id);
    return { ok: false, error: 'invalid_grant', motivo: 'reutilizado' };
  }

  return {
    ok: true, studioId: fila.studio_id, clienteId: fila.cliente_id, authUserId: fila.auth_user_id,
    scopes: fila.scopes, cadenaId: fila.cadena_id,
  };
}

// ─── Tokens (access + refresh, emitidos como par) ────────────────────────────

export interface ParTokens { accessToken: string; refreshToken: string; expiraEnSegundos: number }

export async function emitirParTokens(
  admin: SupabaseClient,
  p: { studioId: string; clienteId: string; authUserId: string; scopes: ScopeOAuth[]; cadenaId: string },
): Promise<ParTokens> {
  const accessToken = generarTokenAleatorio();
  const refreshToken = generarTokenAleatorio();
  const ahora = Date.now();
  await admin.from('oauth_tokens').insert({
    id: uid(), studio_id: p.studioId, cliente_id: p.clienteId, auth_user_id: p.authUserId,
    scopes: p.scopes, access_token_hash: sha256Hex(accessToken), refresh_token_hash: sha256Hex(refreshToken),
    access_token_expira_en: new Date(ahora + TTL_ACCESS_MS).toISOString(),
    refresh_token_expira_en: new Date(ahora + TTL_REFRESH_MS).toISOString(),
    cadena_id: p.cadenaId,
  });
  return { accessToken, refreshToken, expiraEnSegundos: TTL_ACCESS_MS / 1000 };
}

export type RotarRefreshResultado =
  | ({ ok: true; clienteId: string; scopes: ScopeOAuth[] } & ParTokens)
  | { ok: false; error: 'invalid_grant'; motivo: 'no_existe' | 'revocado' | 'expirado' };

// Rotación de refresh token (RFC 6749 §6, "MAY issue a new refresh token"):
// aquí SIEMPRE se rota. Reuse de un refresh ya revocado (token robado y
// reutilizado tras haberse rotado ya legítimamente) revoca la cadena entera.
export async function rotarRefreshToken(admin: SupabaseClient, refreshTokenRecibido: string): Promise<RotarRefreshResultado> {
  const hash = sha256Hex(refreshTokenRecibido);
  const { data: fila } = await admin.from('oauth_tokens').select('*').eq('refresh_token_hash', hash).maybeSingle();
  if (!fila) return { ok: false, error: 'invalid_grant', motivo: 'no_existe' };

  if (fila.revocado_en) {
    await revocarCadena(admin, fila.cadena_id);
    return { ok: false, error: 'invalid_grant', motivo: 'revocado' };
  }
  if (new Date(fila.refresh_token_expira_en).getTime() < Date.now()) {
    return { ok: false, error: 'invalid_grant', motivo: 'expirado' };
  }

  // Reclamar la fila ATÓMICAMENTE antes de emitir nada — mismo patrón que
  // canjearCodigoAutorizacion. Si dos peticiones concurrentes presentan el
  // MISMO refresh token (token interceptado y usado a la vez por atacante y
  // cliente legítimo, o dos llamadas solapadas de Zapier), solo una gana
  // este UPDATE condicionado por `revocado_en IS NULL`; la otra ve 0 filas
  // afectadas y se trata como reuse, revocando la cadena entera — nunca se
  // reparten dos pares de tokens válidos para la misma rotación.
  const { data: reclamada } = await admin
    .from('oauth_tokens')
    .update({ revocado_en: new Date().toISOString() })
    .eq('id', fila.id)
    .is('revocado_en', null)
    .select('id')
    .maybeSingle();

  if (!reclamada) {
    await revocarCadena(admin, fila.cadena_id);
    return { ok: false, error: 'invalid_grant', motivo: 'revocado' };
  }

  const nuevos = await emitirParTokens(admin, {
    studioId: fila.studio_id, clienteId: fila.cliente_id, authUserId: fila.auth_user_id,
    scopes: fila.scopes, cadenaId: fila.cadena_id,
  });

  // Enlazar reemplazado_por ahora que la fila nueva ya existe — solo
  // trazabilidad, la reclamación (lo que importa para reuse-detection) ya
  // quedó sellada arriba.
  const { data: filaNueva } = await admin
    .from('oauth_tokens').select('id').eq('access_token_hash', sha256Hex(nuevos.accessToken)).maybeSingle();
  if (filaNueva) {
    await admin.from('oauth_tokens').update({ reemplazado_por: filaNueva.id }).eq('id', fila.id);
  }

  return { ok: true, clienteId: fila.cliente_id, scopes: fila.scopes, ...nuevos };
}

async function revocarCadena(admin: SupabaseClient, cadenaId: string): Promise<void> {
  await admin.from('oauth_tokens')
    .update({ revocado_en: new Date().toISOString() })
    .eq('cadena_id', cadenaId)
    .is('revocado_en', null);
}

export async function revocarConsentimiento(admin: SupabaseClient, studioId: string, clienteId: string): Promise<void> {
  const ahora = new Date().toISOString();
  await admin.from('oauth_tokens')
    .update({ revocado_en: ahora })
    .eq('studio_id', studioId).eq('cliente_id', clienteId).is('revocado_en', null);
  await admin.from('oauth_consentimientos')
    .update({ revocado_en: ahora })
    .eq('studio_id', studioId).eq('cliente_id', clienteId).is('revocado_en', null);
}

// ─── Middleware Bearer para /api/oauth/v1/* ──────────────────────────────────

export interface ContextoOAuth {
  tokenId: string;
  studioId: string;
  clienteId: string;
  authUserId: string;
  scopes: ScopeOAuth[];
}

// Autentica una request de la API pública vía `Authorization: Bearer <token>`.
// Nunca usa RLS (service-role) — el aislamiento por studio_id es el que cada
// endpoint /api/oauth/v1/* aplica manualmente en su query, con este contexto
// como única fuente de verdad de a qué estudio pertenece el token.
export async function verificarTokenOAuth(req: NextRequest): Promise<ContextoOAuth | null> {
  const authHeader = req.headers.get('authorization');
  const token = authHeader?.replace(/^Bearer /, '');
  if (!token) return null;

  const admin = getSupabaseAdmin();
  if (!admin) return null;

  const { data: fila } = await admin
    .from('oauth_tokens')
    .select('id, studio_id, cliente_id, auth_user_id, scopes, revocado_en, access_token_expira_en')
    .eq('access_token_hash', sha256Hex(token))
    .maybeSingle();

  if (!fila || fila.revocado_en) return null;
  if (new Date(fila.access_token_expira_en).getTime() < Date.now()) return null;

  return {
    tokenId: fila.id, studioId: fila.studio_id, clienteId: fila.cliente_id,
    authUserId: fila.auth_user_id, scopes: fila.scopes,
  };
}

export function tieneScope(ctx: ContextoOAuth, scope: ScopeOAuth): boolean {
  return ctx.scopes.includes(scope);
}

// Auditoría de cada llamada autenticada con Bearer de terceros — fire-and-forget
// (no bloquea la respuesta al cliente por un fallo de logging), mismo criterio
// que el resto de logs de auditoría del repo.
export function auditarAccesoOAuth(
  admin: SupabaseClient,
  p: { tokenId: string | null; studioId: string; clienteId: string; scopeUsado: string | null; metodo: string; ruta: string; statusCode: number; ip: string | null },
): void {
  admin.from('oauth_auditoria_accesos').insert({
    token_id: p.tokenId, studio_id: p.studioId, cliente_id: p.clienteId, scope_usado: p.scopeUsado,
    metodo: p.metodo, ruta: p.ruta, status_code: p.statusCode, ip: p.ip,
  }).then(() => {}, () => {});
}
