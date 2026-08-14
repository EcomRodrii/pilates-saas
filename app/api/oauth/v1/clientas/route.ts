import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { clientIp } from '@/lib/rate-limit-core';
import { verificarTokenOAuth, tieneScope, auditarAccesoOAuth } from '@/lib/oauth-server';
import { registrarSociaPublica } from '@/lib/db/supabase-data-admin';
import { uid } from '@/lib/utils';

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

// POST /api/oauth/v1/clientas — action "Crear cliente" de Zapier. Reutiliza
// registrarSociaPublica (mismo camino que el alta pública desde el portal),
// sin authUserId: la clienta creada vía Zapier no tiene cuenta de portal
// hasta que ella misma se registre. Requiere el scope `clientas:escribir`.
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'oauth-v1-clientas-post', { max: 20, windowSeconds: 60 });
  if (limited) return limited;

  const ctx = await verificarTokenOAuth(req);
  if (!ctx) return NextResponse.json({ error: 'invalid_token' }, { status: 401 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'server_error' }, { status: 503 });

  if (!tieneScope(ctx, 'clientas:escribir')) {
    auditarAccesoOAuth(admin, { tokenId: ctx.tokenId, studioId: ctx.studioId, clienteId: ctx.clienteId, scopeUsado: 'clientas:escribir', metodo: 'POST', ruta: '/api/oauth/v1/clientas', statusCode: 403, ip: clientIp(req) });
    return NextResponse.json({ error: 'insufficient_scope' }, { status: 403 });
  }

  const body = await req.json().catch(() => null) as { nombre?: string; email?: string; telefono?: string } | null;
  if (!body?.nombre || !body?.email) {
    return NextResponse.json({ error: 'invalid_request', detalle: 'nombre y email son obligatorios' }, { status: 400 });
  }

  const id = `soc-${uid()}`;
  const resultado = await registrarSociaPublica({
    studioId: ctx.studioId, id, nombre: body.nombre, email: body.email, telefono: body.telefono,
  });

  let statusCode = 201;
  if ('error' in resultado) {
    // 23505 (email duplicado en el estudio) — mismo mapeo que dbInsertSocio.
    const mensajeError = resultado.error ?? '';
    statusCode = /uq_socios_studio_email/i.test(mensajeError) ? 409
      : resultado.code === 'LIMITE_SOCIAS' ? 403 : 400;
  }
  auditarAccesoOAuth(admin, { tokenId: ctx.tokenId, studioId: ctx.studioId, clienteId: ctx.clienteId, scopeUsado: 'clientas:escribir', metodo: 'POST', ruta: '/api/oauth/v1/clientas', statusCode, ip: clientIp(req) });

  if ('error' in resultado) {
    const mensajeError = resultado.error ?? 'No se pudo crear la clienta';
    const mensaje = /uq_socios_studio_email/i.test(mensajeError) ? 'Ya existe una clienta con ese email' : mensajeError;
    return NextResponse.json({ error: mensaje }, { status: statusCode });
  }
  return NextResponse.json({ id: resultado.socioId ?? id, nombre: body.nombre, email: body.email }, { status: 201 });
}
