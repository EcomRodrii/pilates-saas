import { NextRequest } from 'next/server';
import { conApiPublica, error } from '@/lib/api-publica/servidor';
import { listar } from '@/lib/api-publica/listado';
import { COLUMNAS, clientaPublica } from '@/lib/api-publica/serializar';
import { registrarSociaPublica } from '@/lib/db/supabase-data-admin';
import { uid } from '@/lib/utils';
import { emailValido } from '@/lib/csv';

// GET /api/v1/clientas (alias /api/oauth/v1/clientas) — `clientas:leer`.
// Lo más reciente primero, que es lo que el trigger «Nuevo cliente» de Zapier
// lee para deduplicar por `id`. Paginación por cursor en cabeceras
// (lib/api-publica/listado.ts). Con `clientas:datos_fiscales` añade `nif` y
// `direccion`: son datos privados que en el panel solo ven PROPIETARIO y
// RECEPCIÓN, y un programa de contabilidad los necesita para facturar.
export async function GET(req: NextRequest) {
  return conApiPublica(req, { scope: 'clientas:leer', ruta: '/api/v1/clientas' }, async (ctx, admin) => {
    const fiscal = ctx.scopes.includes('clientas:datos_fiscales');
    return listar(req, admin, ctx, {
      tabla: 'socios',
      columnas: fiscal ? COLUMNAS.clientaFiscal : COLUMNAS.clienta,
      columnaFecha: 'fecha_alta', tipoFecha: 'timestamp',
      filtrar: (q) => q.is('borrado_en', null),
      limitePorDefecto: 25,
      serializar: (f) => {
        const c = clientaPublica(f, fiscal);
        // `activo` y `creadoEn`: los nombres que la v1 devolvió siempre.
        return { ...c, activo: c.activa, creadoEn: c.fechaAlta };
      },
    });
  });
}

// POST /api/v1/clientas — `clientas:escribir`. Reutiliza registrarSociaPublica
// (mismo camino que el alta pública desde el portal), sin authUserId: la
// clienta creada desde fuera no tiene cuenta de portal hasta que ella misma se
// registre.
export async function POST(req: NextRequest) {
  return conApiPublica(req, { scope: 'clientas:escribir', ruta: '/api/v1/clientas', limitePorMinuto: 20 }, async ctx => {
    const body = await req.json().catch(() => null) as { nombre?: string; email?: string; telefono?: string } | null;
    if (!body?.nombre || !body?.email) {
      return error(400, 'invalid_request', 'nombre y email son obligatorios', ctx.requestId);
    }
    // El email de un integrador externo llega sin validar y acaba en el
    // `.ilike('email', …)` con el que registrarSociaPublica adopta fichas
    // fantasma. El escapado de comodines está ya en esa función; esta guarda
    // es la otra mitad.
    if (!emailValido(body.email)) {
      return error(400, 'invalid_request', 'email no válido', ctx.requestId);
    }

    const id = `soc-${uid()}`;
    const resultado = await registrarSociaPublica({
      studioId: ctx.studioId, id, nombre: body.nombre, email: body.email, telefono: body.telefono,
    });

    if ('error' in resultado) {
      // 23505 (email duplicado en el estudio) — mismo mapeo que dbInsertSocio.
      const mensajeError = resultado.error ?? '';
      if (/uq_socios_studio_email/i.test(mensajeError)) {
        return { status: 409, body: { error: 'Ya existe una clienta con ese email', requestId: ctx.requestId } };
      }
      return { status: 400, body: { error: mensajeError || 'No se pudo crear la clienta', requestId: ctx.requestId } };
    }
    return { status: 201, body: { id: resultado.socioId ?? id, nombre: body.nombre, email: body.email } };
  });
}
