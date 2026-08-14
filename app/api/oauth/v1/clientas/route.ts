import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { clientIp } from '@/lib/rate-limit-core';
import { verificarTokenOAuth, tieneScope, auditarAccesoOAuth } from '@/lib/oauth-server';

// GET /api/oauth/v1/clientas — trigger "Nuevo cliente" de Zapier (polling,
// más recientes primero para que Zapier deduplique por `id`). Requiere el
// scope `clientas:leer`. SIEMPRE filtrado por studio_id del token — nunca por
// RLS (estas rutas corren con service-role, ver lib/oauth-server.ts).
export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'oauth-v1-clientas', { max: 60, windowSeconds: 60 });
  if (limited) return limited;

  const ctx = await verificarTokenOAuth(req);
  if (!ctx) return NextResponse.json({ error: 'invalid_token' }, { status: 401 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'server_error' }, { status: 503 });

  if (!tieneScope(ctx, 'clientas:leer')) {
    auditarAccesoOAuth(admin, { tokenId: ctx.tokenId, studioId: ctx.studioId, clienteId: ctx.clienteId, scopeUsado: 'clientas:leer', metodo: 'GET', ruta: '/api/oauth/v1/clientas', statusCode: 403, ip: clientIp(req) });
    return NextResponse.json({ error: 'insufficient_scope' }, { status: 403 });
  }

  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit')) || 25, 100);

  const { data, error } = await admin
    .from('socios')
    .select('id, nombre, apellidos, email, telefono, activo, fecha_alta')
    .eq('studio_id', ctx.studioId)
    .is('borrado_en', null)
    .order('fecha_alta', { ascending: false })
    .limit(limit);

  const statusCode = error ? 500 : 200;
  auditarAccesoOAuth(admin, { tokenId: ctx.tokenId, studioId: ctx.studioId, clienteId: ctx.clienteId, scopeUsado: 'clientas:leer', metodo: 'GET', ruta: '/api/oauth/v1/clientas', statusCode, ip: clientIp(req) });
  if (error) return NextResponse.json({ error: 'server_error' }, { status: 500 });

  return NextResponse.json((data ?? []).map(s => ({
    id: s.id, nombre: s.nombre, apellidos: s.apellidos, email: s.email,
    telefono: s.telefono, activo: s.activo, creadoEn: s.fecha_alta,
  })));
}
