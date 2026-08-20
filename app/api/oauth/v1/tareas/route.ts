import { NextRequest } from 'next/server';
import { conOAuth } from '@/lib/oauth-server';
import { crearTareaAdmin } from '@/lib/tareas-admin';

// POST /api/oauth/v1/tareas — action "Crear tarea" de Zapier. `socioId` es
// opcional (una tarea no tiene por qué estar ligada a una clienta concreta).
// Requiere `tareas:escribir`.
export async function POST(req: NextRequest) {
  return conOAuth(req, { scope: 'tareas:escribir', metodo: 'POST', ruta: '/api/oauth/v1/tareas', rateLimitKey: 'oauth-v1-tareas-post', rateLimitMax: 20 }, async (ctx, admin) => {
    const body = await req.json().catch(() => null) as { titulo?: string; descripcion?: string; socioId?: string; socio_id?: string } | null;
    if (!body?.titulo?.trim()) {
      return { status: 400, body: { error: 'invalid_request', detalle: 'titulo es obligatorio' } };
    }

    // Zapier envía "" (no lo omite) para un campo de texto opcional dejado en
    // blanco — sin normalizar, socio_id: '' viola la FK contra socios.
    const socioId = (body.socioId ?? body.socio_id ?? '').trim() || null;

    const resultado = await crearTareaAdmin(admin, {
      studioId: ctx.studioId, titulo: body.titulo.trim(), descripcion: body.descripcion ?? null,
      socioId, origen: 'API',
    });

    if ('error' in resultado) return { status: 400, body: { error: resultado.error } };
    return { status: 201, body: { id: resultado.id } };
  });
}
