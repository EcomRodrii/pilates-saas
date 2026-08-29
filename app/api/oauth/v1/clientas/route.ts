import { NextRequest } from 'next/server';
import { conOAuth } from '@/lib/oauth-server';
import { registrarSociaPublica } from '@/lib/db/supabase-data-admin';
import { uid } from '@/lib/utils';
import { emailValido } from '@/lib/csv';

// GET /api/oauth/v1/clientas — trigger "Nuevo cliente" de Zapier (polling,
// más recientes primero para que Zapier deduplique por `id`). Requiere el
// scope `clientas:leer`. SIEMPRE filtrado por studio_id del token — nunca por
// RLS (estas rutas corren con service-role, ver lib/oauth-server.ts).
export async function GET(req: NextRequest) {
  return conOAuth(req, { scope: 'clientas:leer', metodo: 'GET', ruta: '/api/oauth/v1/clientas', rateLimitKey: 'oauth-v1-clientas', rateLimitMax: 60 }, async (ctx, admin) => {
    const limit = Math.min(Number(req.nextUrl.searchParams.get('limit')) || 25, 100);

    const { data, error } = await admin
      .from('socios')
      .select('id, nombre, apellidos, email, telefono, activo, fecha_alta')
      .eq('studio_id', ctx.studioId)
      .is('borrado_en', null)
      .order('fecha_alta', { ascending: false })
      .limit(limit);

    if (error) return { status: 500, body: { error: 'server_error' } };
    return {
      status: 200,
      body: (data ?? []).map(s => ({
        id: s.id, nombre: s.nombre, apellidos: s.apellidos, email: s.email,
        telefono: s.telefono, activo: s.activo, creadoEn: s.fecha_alta,
      })),
    };
  });
}

// POST /api/oauth/v1/clientas — action "Crear cliente" de Zapier. Reutiliza
// registrarSociaPublica (mismo camino que el alta pública desde el portal),
// sin authUserId: la clienta creada vía Zapier no tiene cuenta de portal
// hasta que ella misma se registre. Requiere el scope `clientas:escribir`.
export async function POST(req: NextRequest) {
  return conOAuth(req, { scope: 'clientas:escribir', metodo: 'POST', ruta: '/api/oauth/v1/clientas', rateLimitKey: 'oauth-v1-clientas-post', rateLimitMax: 20 }, async ctx => {
    const body = await req.json().catch(() => null) as { nombre?: string; email?: string; telefono?: string } | null;
    if (!body?.nombre || !body?.email) {
      return { status: 400, body: { error: 'invalid_request', detalle: 'nombre y email son obligatorios' } };
    }
    // El email de un integrador externo llega sin validar y acaba en el
    // `.ilike('email', …)` con el que registrarSociaPublica adopta fichas
    // fantasma. El escapado de comodines está ya en esa función; esta guarda
    // es la otra mitad: un valor que no es un email no debería llegar a la
    // consulta siquiera, y el error es más útil que un 400 genérico después.
    if (!emailValido(body.email)) {
      return { status: 400, body: { error: 'invalid_request', detalle: 'email no válido' } };
    }

    const id = `soc-${uid()}`;
    const resultado = await registrarSociaPublica({
      studioId: ctx.studioId, id, nombre: body.nombre, email: body.email, telefono: body.telefono,
    });

    if ('error' in resultado) {
      // 23505 (email duplicado en el estudio) — mismo mapeo que dbInsertSocio.
      const mensajeError = resultado.error ?? '';
      const status = /uq_socios_studio_email/i.test(mensajeError) ? 409
        : resultado.code === 'LIMITE_SOCIAS' ? 403 : 400;
      const mensaje = /uq_socios_studio_email/i.test(mensajeError) ? 'Ya existe una clienta con ese email' : (mensajeError || 'No se pudo crear la clienta');
      return { status, body: { error: mensaje } };
    }
    return { status: 201, body: { id: resultado.socioId ?? id, nombre: body.nombre, email: body.email } };
  });
}
