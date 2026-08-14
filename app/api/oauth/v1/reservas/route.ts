import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { clientIp } from '@/lib/rate-limit-core';
import { verificarTokenOAuth, tieneScope, auditarAccesoOAuth } from '@/lib/oauth-server';

// GET /api/oauth/v1/reservas — triggers "Nueva reserva"/"Reserva cancelada"
// de Zapier (polling). `?estado=` filtra (CONFIRMADA por defecto; pasar
// CANCELADA para el segundo trigger). Requiere `reservas:leer`.
export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'oauth-v1-reservas', { max: 60, windowSeconds: 60 });
  if (limited) return limited;

  const ctx = await verificarTokenOAuth(req);
  if (!ctx) return NextResponse.json({ error: 'invalid_token' }, { status: 401 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'server_error' }, { status: 503 });

  if (!tieneScope(ctx, 'reservas:leer')) {
    auditarAccesoOAuth(admin, { tokenId: ctx.tokenId, studioId: ctx.studioId, clienteId: ctx.clienteId, scopeUsado: 'reservas:leer', metodo: 'GET', ruta: '/api/oauth/v1/reservas', statusCode: 403, ip: clientIp(req) });
    return NextResponse.json({ error: 'insufficient_scope' }, { status: 403 });
  }

  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit')) || 25, 100);
  const estado = req.nextUrl.searchParams.get('estado') ?? 'CONFIRMADA';

  const { data, error } = await admin
    .from('reservas')
    .select('id, sesion_id, socio_id, estado, spot_id, creado_en')
    .eq('studio_id', ctx.studioId)
    .eq('estado', estado)
    .order('creado_en', { ascending: false })
    .limit(limit);

  const statusCode = error ? 500 : 200;
  auditarAccesoOAuth(admin, { tokenId: ctx.tokenId, studioId: ctx.studioId, clienteId: ctx.clienteId, scopeUsado: 'reservas:leer', metodo: 'GET', ruta: '/api/oauth/v1/reservas', statusCode, ip: clientIp(req) });
  if (error) return NextResponse.json({ error: 'server_error' }, { status: 500 });

  return NextResponse.json((data ?? []).map(r => ({
    id: r.id, sesionId: r.sesion_id, socioId: r.socio_id, estado: r.estado,
    spotId: r.spot_id, creadoEn: r.creado_en,
  })));
}
