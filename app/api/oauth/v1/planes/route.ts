import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { clientIp } from '@/lib/rate-limit-core';
import { verificarTokenOAuth, tieneScope, auditarAccesoOAuth } from '@/lib/oauth-server';

// GET /api/oauth/v1/planes — Fase 9 (docs/api-publica-v1-diseno.md §3.2): la
// pregunta de negocio que un desarrollador externo haría de verdad ("¿qué
// plan/bono tiene esta clienta?"), sin endpoint hasta ahora. `?socioId=`
// filtra a una sola clienta; sin él, todas las suscripciones ACTIVA del
// estudio. Lee `suscripciones` vía service-role (misma RLS abierta a todo el
// personal ya documentada como decisión de producto — aquí no se toca esa
// RLS, se lee igual que el resto de /api/oauth/v1/*). Requiere `planes:leer`.
export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'oauth-v1-planes', { max: 60, windowSeconds: 60 });
  if (limited) return limited;

  const ctx = await verificarTokenOAuth(req);
  if (!ctx) return NextResponse.json({ error: 'invalid_token' }, { status: 401 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'server_error' }, { status: 503 });

  if (!tieneScope(ctx, 'planes:leer')) {
    auditarAccesoOAuth(admin, { tokenId: ctx.tokenId, studioId: ctx.studioId, clienteId: ctx.clienteId, scopeUsado: 'planes:leer', metodo: 'GET', ruta: '/api/oauth/v1/planes', statusCode: 403, ip: clientIp(req) });
    return NextResponse.json({ error: 'insufficient_scope' }, { status: 403 });
  }

  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit')) || 25, 100);
  const socioId = req.nextUrl.searchParams.get('socioId');
  const estado = req.nextUrl.searchParams.get('estado') ?? 'ACTIVA';

  let query = admin
    .from('suscripciones')
    .select('id, socio_id, plan_id, estado, fecha_inicio, fecha_fin, sesiones_restantes')
    .eq('studio_id', ctx.studioId)
    .eq('estado', estado);
  if (socioId) query = query.eq('socio_id', socioId);
  const { data, error } = await query.order('fecha_inicio', { ascending: false }).limit(limit);

  const statusCode = error ? 500 : 200;
  auditarAccesoOAuth(admin, { tokenId: ctx.tokenId, studioId: ctx.studioId, clienteId: ctx.clienteId, scopeUsado: 'planes:leer', metodo: 'GET', ruta: '/api/oauth/v1/planes', statusCode, ip: clientIp(req) });
  if (error) return NextResponse.json({ error: 'server_error' }, { status: 500 });

  return NextResponse.json((data ?? []).map(s => ({
    id: s.id, socioId: s.socio_id, planId: s.plan_id, estado: s.estado,
    fechaInicio: s.fecha_inicio, fechaFin: s.fecha_fin, sesionesRestantes: s.sesiones_restantes,
  })));
}
