import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import {
  buscarClienteOAuth, verificarClientSecret, canjearCodigoAutorizacion,
  emitirParTokens, rotarRefreshToken,
} from '@/lib/oauth-server';

// Token endpoint (RFC 6749 §3.2/§4.1.3/§6). Sin sesión de staff — la
// autenticación aquí es client_id/client_secret (+ code/PKCE o refresh_token),
// exactamente como cualquier servidor OAuth. Acepta tanto
// application/x-www-form-urlencoded (lo que exige el RFC y lo que Zapier
// manda por defecto) como JSON, y client auth por HTTP Basic o por el body —
// ambos son formas estándar que distintas plataformas usan indistintamente.

async function leerCuerpo(req: NextRequest): Promise<Record<string, string>> {
  const contentType = req.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const json = await req.json().catch(() => ({}));
    return typeof json === 'object' && json ? json as Record<string, string> : {};
  }
  const texto = await req.text();
  return Object.fromEntries(new URLSearchParams(texto));
}

function credencialesBasicAuth(req: NextRequest): { clientId: string; clientSecret: string } | null {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Basic ')) return null;
  try {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const idx = decoded.indexOf(':');
    if (idx < 0) return null;
    return { clientId: decoded.slice(0, idx), clientSecret: decoded.slice(idx + 1) };
  } catch {
    return null;
  }
}

function errorOAuth(codigo: string, status: number) {
  return NextResponse.json({ error: codigo }, { status });
}

export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return errorOAuth('server_error', 503);

  const body = await leerCuerpo(req);
  const basic = credencialesBasicAuth(req);
  const clientId = basic?.clientId ?? body.client_id;
  const clientSecret = basic?.clientSecret ?? body.client_secret;

  const limited = await enforceRateLimit(req, 'oauth-token', { max: 20, windowSeconds: 60 }, clientId ?? undefined);
  if (limited) return limited;

  if (!clientId) return errorOAuth('invalid_client', 401);
  const cliente = await buscarClienteOAuth(admin, clientId);
  if (!cliente) return errorOAuth('invalid_client', 401);

  if (cliente.esConfidencial) {
    if (!clientSecret || !verificarClientSecret(cliente, clientSecret)) {
      return errorOAuth('invalid_client', 401);
    }
  }

  const grantType = body.grant_type;

  if (grantType === 'authorization_code') {
    const { code, redirect_uri: redirectUri, code_verifier: codeVerifier } = body;
    if (!code || !redirectUri || !codeVerifier) return errorOAuth('invalid_request', 400);

    const resultado = await canjearCodigoAutorizacion(admin, code, redirectUri, codeVerifier, cliente.id);
    if (!resultado.ok) return errorOAuth(resultado.error, 400);

    const tokens = await emitirParTokens(admin, {
      studioId: resultado.studioId, clienteId: resultado.clienteId, authUserId: resultado.authUserId,
      scopes: resultado.scopes, cadenaId: resultado.cadenaId,
    });

    return NextResponse.json({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      token_type: 'Bearer',
      expires_in: tokens.expiraEnSegundos,
      scope: resultado.scopes.join(' '),
    });
  }

  if (grantType === 'refresh_token') {
    const refreshToken = body.refresh_token;
    if (!refreshToken) return errorOAuth('invalid_request', 400);

    const resultado = await rotarRefreshToken(admin, refreshToken);
    if (!resultado.ok) return errorOAuth(resultado.error, 400);
    if (resultado.clienteId !== cliente.id) return errorOAuth('invalid_grant', 400);

    return NextResponse.json({
      access_token: resultado.accessToken,
      refresh_token: resultado.refreshToken,
      token_type: 'Bearer',
      expires_in: resultado.expiraEnSegundos,
      scope: resultado.scopes.join(' '),
    });
  }

  return errorOAuth('unsupported_grant_type', 400);
}
