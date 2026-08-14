import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { clientIp } from '@/lib/rate-limit-core';
import { verificarTokenOAuth, tieneScope, auditarAccesoOAuth } from '@/lib/oauth-server';
import { cancelarReservaPublica } from '@/lib/db/supabase-data-admin';

// POST /api/oauth/v1/reservas/cancelar — action "Cancelar reserva" de
// Zapier. Reutiliza cancelarReservaPublica (mismo camino que /reservar:
// devuelve bono si procede, promueve lista de espera, APLICA la penalización
// por cancelación tardía si el estudio la tiene activada — nunca
// omitirPenalizacion, esto es una cancelación real, no un corte automático
// del sistema). Requiere `reservas:escribir`.
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'oauth-v1-reservas-cancelar', { max: 20, windowSeconds: 60 });
  if (limited) return limited;

  const ctx = await verificarTokenOAuth(req);
  if (!ctx) return NextResponse.json({ error: 'invalid_token' }, { status: 401 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'server_error' }, { status: 503 });

  if (!tieneScope(ctx, 'reservas:escribir')) {
    auditarAccesoOAuth(admin, { tokenId: ctx.tokenId, studioId: ctx.studioId, clienteId: ctx.clienteId, scopeUsado: 'reservas:escribir', metodo: 'POST', ruta: '/api/oauth/v1/reservas/cancelar', statusCode: 403, ip: clientIp(req) });
    return NextResponse.json({ error: 'insufficient_scope' }, { status: 403 });
  }

  const body = await req.json().catch(() => null) as { reservaId?: string; reserva_id?: string } | null;
  const reservaId = body?.reservaId ?? body?.reserva_id;
  if (!reservaId) return NextResponse.json({ error: 'invalid_request', detalle: 'reservaId es obligatorio' }, { status: 400 });

  // La reserva trae el socio_id — se resuelve aquí para no exigirle a Zapier
  // que sepa de quién es, y de paso confirma que pertenece a este estudio.
  const { data: reserva } = await admin
    .from('reservas').select('socio_id').eq('id', reservaId).eq('studio_id', ctx.studioId).maybeSingle();
  if (!reserva?.socio_id) {
    auditarAccesoOAuth(admin, { tokenId: ctx.tokenId, studioId: ctx.studioId, clienteId: ctx.clienteId, scopeUsado: 'reservas:escribir', metodo: 'POST', ruta: '/api/oauth/v1/reservas/cancelar', statusCode: 404, ip: clientIp(req) });
    return NextResponse.json({ error: 'Reserva no encontrada' }, { status: 404 });
  }

  const { data: socio } = await admin
    .from('socios').select('email').eq('id', reserva.socio_id).eq('studio_id', ctx.studioId).maybeSingle();
  if (!socio) return NextResponse.json({ error: 'Clienta no encontrada' }, { status: 404 });

  const resultado = await cancelarReservaPublica({
    studioId: ctx.studioId, reservaId, socioId: reserva.socio_id, email: socio.email,
  });

  const statusCode = 'error' in resultado ? 400 : 200;
  auditarAccesoOAuth(admin, { tokenId: ctx.tokenId, studioId: ctx.studioId, clienteId: ctx.clienteId, scopeUsado: 'reservas:escribir', metodo: 'POST', ruta: '/api/oauth/v1/reservas/cancelar', statusCode, ip: clientIp(req) });

  if ('error' in resultado) return NextResponse.json({ error: resultado.error }, { status: 400 });
  return NextResponse.json({
    ok: true, tardia: resultado.tardia, bonoDevuelto: resultado.bonoDevuelto,
    recuperacionCreada: resultado.recuperacionCreada,
  });
}
