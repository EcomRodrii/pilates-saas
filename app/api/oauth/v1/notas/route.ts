import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { clientIp } from '@/lib/rate-limit-core';
import { verificarTokenOAuth, tieneScope, auditarAccesoOAuth } from '@/lib/oauth-server';
import { crearNotaInternaAdmin } from '@/lib/notas-internas-admin';

// POST /api/oauth/v1/notas — action "Crear nota" de Zapier. Nota OPERATIVA
// (notas_internas), nunca ficha clínica (salud_notas_progreso está excluida
// a propósito del scope `notas:*`, ver docs/oauth-arquitectura.md).
// Requiere `notas:escribir`.
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'oauth-v1-notas-post', { max: 20, windowSeconds: 60 });
  if (limited) return limited;

  const ctx = await verificarTokenOAuth(req);
  if (!ctx) return NextResponse.json({ error: 'invalid_token' }, { status: 401 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'server_error' }, { status: 503 });

  if (!tieneScope(ctx, 'notas:escribir')) {
    auditarAccesoOAuth(admin, { tokenId: ctx.tokenId, studioId: ctx.studioId, clienteId: ctx.clienteId, scopeUsado: 'notas:escribir', metodo: 'POST', ruta: '/api/oauth/v1/notas', statusCode: 403, ip: clientIp(req) });
    return NextResponse.json({ error: 'insufficient_scope' }, { status: 403 });
  }

  const body = await req.json().catch(() => null) as { socioId?: string; socio_id?: string; texto?: string } | null;
  const socioId = body?.socioId ?? body?.socio_id;
  if (!socioId || !body?.texto?.trim()) {
    return NextResponse.json({ error: 'invalid_request', detalle: 'socioId y texto son obligatorios' }, { status: 400 });
  }

  const resultado = await crearNotaInternaAdmin(admin, { studioId: ctx.studioId, socioId, texto: body.texto.trim() });

  const statusCode = 'error' in resultado ? 400 : 201;
  auditarAccesoOAuth(admin, { tokenId: ctx.tokenId, studioId: ctx.studioId, clienteId: ctx.clienteId, scopeUsado: 'notas:escribir', metodo: 'POST', ruta: '/api/oauth/v1/notas', statusCode, ip: clientIp(req) });

  if ('error' in resultado) return NextResponse.json({ error: resultado.error }, { status: statusCode });
  return NextResponse.json({ id: resultado.id }, { status: 201 });
}
