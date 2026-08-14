import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { verificarSesionStaff } from '@/lib/auth-server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { puedeGestionarAppsOAuth } from '@/lib/permisos-reglas';
import { buscarClienteOAuth, redirectUriPermitida, crearCodigoAutorizacion } from '@/lib/oauth-server';
import { scopesValidos, DESCRIPCION_SCOPE, type ScopeOAuth } from '@/lib/oauth-crypto';
import { uid } from '@/lib/utils';

// La pantalla /oauth/authorize (cliente) llama a esta ruta en dos tiempos:
//  GET  → valida los parámetros de la query y devuelve qué mostrar en el
//         consentimiento (nombre/scopes de la app), sin crear nada todavía.
//  POST → el usuario pulsó "Autorizar": crea el authorization code y devuelve
//         la URL de retorno completa (el servidor construye la redirect_uri
//         final, nunca el cliente, para no reabrir la puerta de un redirect
//         no confiable).
//
// PKCE es OBLIGATORIO siempre (ver docs/oauth-arquitectura.md §B.5): sin
// code_challenge no hay authorize posible, sea el cliente confidencial o no.

function validarParams(sp: URLSearchParams) {
  const clientId = sp.get('client_id');
  const redirectUri = sp.get('redirect_uri');
  const responseType = sp.get('response_type');
  const scopeRaw = sp.get('scope');
  const codeChallenge = sp.get('code_challenge');
  const codeChallengeMethod = sp.get('code_challenge_method');
  const state = sp.get('state');

  if (!clientId || !redirectUri || !scopeRaw || !codeChallenge) {
    return { error: 'invalid_request' as const };
  }
  if (responseType !== 'code') return { error: 'unsupported_response_type' as const };
  if (codeChallengeMethod !== 'S256') return { error: 'invalid_request' as const };

  const scopes = scopeRaw.split(' ').filter(Boolean);
  if (!scopesValidos(scopes)) return { error: 'invalid_scope' as const };

  return { clientId, redirectUri, scopes, codeChallenge, state: state ?? undefined };
}

export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'oauth-authorize-get', { max: 60, windowSeconds: 60 });
  if (limited) return limited;

  const v = validarParams(req.nextUrl.searchParams);
  if ('error' in v) return NextResponse.json({ error: v.error }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'server_error' }, { status: 503 });

  const cliente = await buscarClienteOAuth(admin, v.clientId);
  if (!cliente) return NextResponse.json({ error: 'invalid_client' }, { status: 400 });
  if (!redirectUriPermitida(cliente, v.redirectUri)) {
    // Sin redirigir con el error: un redirect_uri no reconocido es justo el
    // caso en el que NO nos fiamos de a dónde apunta.
    return NextResponse.json({ error: 'invalid_request', detalle: 'redirect_uri no autorizada' }, { status: 400 });
  }

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'login_required' }, { status: 401 });
  if (!puedeGestionarAppsOAuth(sesion.rol)) {
    return NextResponse.json({ error: 'access_denied', detalle: 'Solo la propietaria o un manager pueden conectar aplicaciones' }, { status: 403 });
  }

  const { data: studio } = await admin.from('studios').select('nombre').eq('id', sesion.studioId).maybeSingle();

  return NextResponse.json({
    cliente: { nombre: cliente.nombre, descripcion: cliente.descripcion, logoUrl: cliente.logoUrl },
    estudioNombre: studio?.nombre ?? 'tu estudio',
    scopes: v.scopes.map(s => ({ scope: s, descripcion: DESCRIPCION_SCOPE[s as ScopeOAuth] })),
  });
}

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'oauth-authorize-post', { max: 20, windowSeconds: 60 });
  if (limited) return limited;

  const body = await req.json().catch(() => null) as {
    clientId?: string; redirectUri?: string; scope?: string; state?: string;
    codeChallenge?: string; codeChallengeMethod?: string;
  } | null;
  if (!body) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });

  const sp = new URLSearchParams({
    client_id: body.clientId ?? '', redirect_uri: body.redirectUri ?? '',
    response_type: 'code', scope: body.scope ?? '',
    code_challenge: body.codeChallenge ?? '', code_challenge_method: body.codeChallengeMethod ?? '',
    ...(body.state ? { state: body.state } : {}),
  });
  const v = validarParams(sp);
  if ('error' in v) return NextResponse.json({ error: v.error }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'server_error' }, { status: 503 });

  const cliente = await buscarClienteOAuth(admin, v.clientId);
  if (!cliente) return NextResponse.json({ error: 'invalid_client' }, { status: 400 });
  if (!redirectUriPermitida(cliente, v.redirectUri)) {
    return NextResponse.json({ error: 'invalid_request', detalle: 'redirect_uri no autorizada' }, { status: 400 });
  }

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'login_required' }, { status: 401 });
  if (!puedeGestionarAppsOAuth(sesion.rol)) {
    return NextResponse.json({ error: 'access_denied' }, { status: 403 });
  }

  const codigo = await crearCodigoAutorizacion(admin, {
    studioId: sesion.studioId, clienteId: cliente.id, authUserId: sesion.userId,
    scopes: v.scopes as ScopeOAuth[], redirectUri: v.redirectUri, codeChallenge: v.codeChallenge,
  });

  // Registrar/renovar el consentimiento — un consentimiento por (estudio,
  // cliente): reautorizar simplemente amplía scopes y limpia una revocación
  // previa.
  await admin.from('oauth_consentimientos').upsert({
    id: uid(), studio_id: sesion.studioId, cliente_id: cliente.id, otorgado_por: sesion.userId,
    scopes: v.scopes, otorgado_en: new Date().toISOString(), revocado_en: null,
  }, { onConflict: 'studio_id,cliente_id' });

  const redirectUrl = new URL(v.redirectUri);
  redirectUrl.searchParams.set('code', codigo);
  if (v.state) redirectUrl.searchParams.set('state', v.state);

  return NextResponse.json({ redirectUrl: redirectUrl.toString() });
}
