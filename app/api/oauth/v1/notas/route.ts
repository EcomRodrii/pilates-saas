import { NextRequest } from 'next/server';
import { conOAuth } from '@/lib/oauth-server';
import { crearNotaInternaAdmin } from '@/lib/notas-internas-admin';

// POST /api/oauth/v1/notas — action "Crear nota" de Zapier. Nota OPERATIVA
// (notas_internas), nunca ficha clínica (salud_notas_progreso está excluida
// a propósito del scope `notas:*`, ver docs/oauth-arquitectura.md).
// Requiere `notas:escribir`.
export async function POST(req: NextRequest) {
  return conOAuth(req, { scope: 'notas:escribir', metodo: 'POST', ruta: '/api/oauth/v1/notas', rateLimitKey: 'oauth-v1-notas-post', rateLimitMax: 20 }, async (ctx, admin) => {
    const body = await req.json().catch(() => null) as { socioId?: string; socio_id?: string; texto?: string } | null;
    const socioId = body?.socioId ?? body?.socio_id;
    if (!socioId || !body?.texto?.trim()) {
      return { status: 400, body: { error: 'invalid_request', detalle: 'socioId y texto son obligatorios' } };
    }

    const resultado = await crearNotaInternaAdmin(admin, { studioId: ctx.studioId, socioId, texto: body.texto.trim() });

    if ('error' in resultado) return { status: 400, body: { error: resultado.error } };
    return { status: 201, body: { id: resultado.id } };
  });
}
