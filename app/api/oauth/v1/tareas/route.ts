import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { clientIp } from '@/lib/rate-limit-core';
import { verificarTokenOAuth, tieneScope, auditarAccesoOAuth } from '@/lib/oauth-server';
import { crearTareaAdmin } from '@/lib/tareas-admin';

// POST /api/oauth/v1/tareas — action "Crear tarea" de Zapier. `socioId` es
// opcional (una tarea no tiene por qué estar ligada a una clienta concreta).
// Requiere `tareas:escribir`.
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'oauth-v1-tareas-post', { max: 20, windowSeconds: 60 });
  if (limited) return limited;

  const ctx = await verificarTokenOAuth(req);
  if (!ctx) return NextResponse.json({ error: 'invalid_token' }, { status: 401 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'server_error' }, { status: 503 });

  if (!tieneScope(ctx, 'tareas:escribir')) {
    auditarAccesoOAuth(admin, { tokenId: ctx.tokenId, studioId: ctx.studioId, clienteId: ctx.clienteId, scopeUsado: 'tareas:escribir', metodo: 'POST', ruta: '/api/oauth/v1/tareas', statusCode: 403, ip: clientIp(req) });
    return NextResponse.json({ error: 'insufficient_scope' }, { status: 403 });
  }

  const body = await req.json().catch(() => null) as { titulo?: string; descripcion?: string; socioId?: string; socio_id?: string } | null;
  if (!body?.titulo?.trim()) {
    return NextResponse.json({ error: 'invalid_request', detalle: 'titulo es obligatorio' }, { status: 400 });
  }

  const resultado = await crearTareaAdmin(admin, {
    studioId: ctx.studioId, titulo: body.titulo.trim(), descripcion: body.descripcion ?? null,
    socioId: body.socioId ?? body.socio_id ?? null, origen: 'API',
  });

  const statusCode = 'error' in resultado ? 400 : 201;
  auditarAccesoOAuth(admin, { tokenId: ctx.tokenId, studioId: ctx.studioId, clienteId: ctx.clienteId, scopeUsado: 'tareas:escribir', metodo: 'POST', ruta: '/api/oauth/v1/tareas', statusCode, ip: clientIp(req) });

  if ('error' in resultado) return NextResponse.json({ error: resultado.error }, { status: statusCode });
  return NextResponse.json({ id: resultado.id }, { status: 201 });
}
