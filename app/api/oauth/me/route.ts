import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { verificarTokenOAuth, auditarAccesoOAuth } from '@/lib/oauth-server';
import { clientIp } from '@/lib/rate-limit-core';

// Endpoint que Zapier llama para "Probar la conexión" (Test Trigger de
// autenticación de la plataforma). Lista blanca de campos — mismo criterio
// que studioPublico(): nunca el objeto crudo de studios/instructores, que
// llevaría columnas internas.
export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'oauth-me', { max: 60, windowSeconds: 60 });
  if (limited) return limited;

  const ctx = await verificarTokenOAuth(req);
  if (!ctx) return NextResponse.json({ error: 'invalid_token' }, { status: 401 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'server_error' }, { status: 503 });

  const [{ data: studio }, { data: instructor }] = await Promise.all([
    admin.from('studios').select('id, nombre').eq('id', ctx.studioId).maybeSingle(),
    admin.from('instructores').select('rol, nombre').eq('auth_user_id', ctx.authUserId).eq('studio_id', ctx.studioId).maybeSingle(),
  ]);

  const respuesta = {
    estudio: { id: ctx.studioId, nombre: studio?.nombre ?? null },
    usuario: { nombre: instructor?.nombre ?? null, rol: instructor?.rol ?? 'PROPIETARIO' },
    scopes: ctx.scopes,
  };

  auditarAccesoOAuth(admin, {
    tokenId: ctx.tokenId, studioId: ctx.studioId, clienteId: ctx.clienteId, scopeUsado: null,
    metodo: 'GET', ruta: '/api/oauth/me', statusCode: 200, ip: clientIp(req),
  });

  return NextResponse.json(respuesta);
}
