import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { clientIp } from '@/lib/rate-limit-core';
import { verificarTokenOAuth, tieneScope, auditarAccesoOAuth } from '@/lib/oauth-server';
import { crearReservaPublica } from '@/lib/db/supabase-data-admin';

// GET /api/oauth/v1/reservas — triggers "Nueva reserva"/"Reserva cancelada"
// de Zapier (polling). `?estado=` filtra (CONFIRMADA por defecto; pasar
// CANCELADA para el segundo trigger). `?socioId=` filtra además por clienta
// (Fase 9 — extensión incremental, docs/api-publica-v1-diseno.md §3.1): sin
// esto, "las reservas de esta clienta" exigía traer toda la página y filtrar
// en el cliente. Requiere `reservas:leer`.
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
  const socioId = req.nextUrl.searchParams.get('socioId');

  let query = admin
    .from('reservas')
    .select('id, sesion_id, socio_id, estado, spot_id, creado_en')
    .eq('studio_id', ctx.studioId)
    .eq('estado', estado);
  if (socioId) query = query.eq('socio_id', socioId);
  const { data, error } = await query.order('creado_en', { ascending: false }).limit(limit);

  const statusCode = error ? 500 : 200;
  auditarAccesoOAuth(admin, { tokenId: ctx.tokenId, studioId: ctx.studioId, clienteId: ctx.clienteId, scopeUsado: 'reservas:leer', metodo: 'GET', ruta: '/api/oauth/v1/reservas', statusCode, ip: clientIp(req) });
  if (error) return NextResponse.json({ error: 'server_error' }, { status: 500 });

  return NextResponse.json((data ?? []).map(r => ({
    id: r.id, sesionId: r.sesion_id, socioId: r.socio_id, estado: r.estado,
    spotId: r.spot_id, creadoEn: r.creado_en,
  })));
}

// POST /api/oauth/v1/reservas — action "Crear reserva" de Zapier. Reutiliza
// crearReservaPublica (mismo camino que /reservar, con todas sus reglas:
// ventana, gate de plan/bono, aforo transaccional). Esa función exige el
// email de la socia para validarla (pensada para JWT de magic link); aquí no
// hay JWT de socia, así que se lee su email de la BD, ya acotado por
// studio_id — el aislamiento lo da el token OAuth, no ese email. Requiere
// `reservas:escribir`.
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'oauth-v1-reservas-post', { max: 20, windowSeconds: 60 });
  if (limited) return limited;

  const ctx = await verificarTokenOAuth(req);
  if (!ctx) return NextResponse.json({ error: 'invalid_token' }, { status: 401 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'server_error' }, { status: 503 });

  if (!tieneScope(ctx, 'reservas:escribir')) {
    auditarAccesoOAuth(admin, { tokenId: ctx.tokenId, studioId: ctx.studioId, clienteId: ctx.clienteId, scopeUsado: 'reservas:escribir', metodo: 'POST', ruta: '/api/oauth/v1/reservas', statusCode: 403, ip: clientIp(req) });
    return NextResponse.json({ error: 'insufficient_scope' }, { status: 403 });
  }

  const body = await req.json().catch(() => null) as {
    socioId?: string; sesionId?: string; spotId?: string;
    socio_id?: string; sesion_id?: string; spot_id?: string;
  } | null;
  const socioId = body?.socioId ?? body?.socio_id;
  const sesionId = body?.sesionId ?? body?.sesion_id;
  const spotId = body?.spotId ?? body?.spot_id;
  if (!socioId || !sesionId) {
    return NextResponse.json({ error: 'invalid_request', detalle: 'socioId y sesionId son obligatorios' }, { status: 400 });
  }

  const { data: socio } = await admin
    .from('socios').select('email').eq('id', socioId).eq('studio_id', ctx.studioId).is('borrado_en', null).maybeSingle();
  if (!socio) {
    auditarAccesoOAuth(admin, { tokenId: ctx.tokenId, studioId: ctx.studioId, clienteId: ctx.clienteId, scopeUsado: 'reservas:escribir', metodo: 'POST', ruta: '/api/oauth/v1/reservas', statusCode: 404, ip: clientIp(req) });
    return NextResponse.json({ error: 'Clienta no encontrada' }, { status: 404 });
  }

  const resultado = await crearReservaPublica({
    studioId: ctx.studioId, sesionId, socioId, email: socio.email, spotId,
  });

  const statusCode = 'error' in resultado ? 400 : 201;
  auditarAccesoOAuth(admin, { tokenId: ctx.tokenId, studioId: ctx.studioId, clienteId: ctx.clienteId, scopeUsado: 'reservas:escribir', metodo: 'POST', ruta: '/api/oauth/v1/reservas', statusCode, ip: clientIp(req) });

  if ('error' in resultado) return NextResponse.json({ error: resultado.error }, { status: 400 });
  return NextResponse.json({
    id: resultado.reservaId, estado: resultado.estado, spotAsignado: resultado.spotAsignado,
  }, { status: 201 });
}
