import { NextRequest } from 'next/server';
import { conApiPublica, error } from '@/lib/api-publica/servidor';
import { COLUMNAS, estudioPublico } from '@/lib/api-publica/serializar';

// GET /api/v1/estudio — el estudio de la petición: datos fiscales del emisor,
// zona horaria, moneda e IVA por defecto. Singular a propósito: cada petición
// va a UNA sede (la de la credencial o, con una clave de cadena, la de la
// cabecera Tentare-Estudio). Las sedes de una cadena: GET /api/v1/estudios.
// Vale con cualquier credencial válida.
//
// `studios` es la única tabla de la API sin columna `studio_id`: su clave ES el
// estudio, así que aquí se filtra por `id` (y no por `obtener`, que filtra por
// `studio_id` y daba 500).
export async function GET(req: NextRequest) {
  return conApiPublica(req, { scope: null, ruta: '/api/v1/estudio' }, async (ctx, admin) => {
    const { data, error: errorBd } = await admin.from('studios').select(COLUMNAS.estudio).eq('id', ctx.studioId).maybeSingle();
    if (errorBd) return error(500, 'server_error', 'No se pudo leer el estudio.', ctx.requestId);
    if (!data) return error(404, 'not_found', 'Estudio no encontrado.', ctx.requestId);
    return { status: 200, body: estudioPublico(data as unknown as Record<string, unknown>) };
  });
}
