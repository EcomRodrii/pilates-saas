import { NextRequest } from 'next/server';
import { conApiPublica, error } from '@/lib/api-publica/servidor';
import { COLUMNAS, tarifaPublica } from '@/lib/api-publica/serializar';

// GET /api/v1/tarifas — `planes:leer`. El catálogo de planes y bonos del
// estudio, con su precio en céntimos. Es corto (decenas de filas): sin
// paginación. `?activas=true` deja solo las que se venden hoy.
export async function GET(req: NextRequest) {
  return conApiPublica(req, { scope: 'planes:leer', ruta: '/api/v1/tarifas' }, async (ctx, admin) => {
    let q = admin.from('planes_tarifa').select(COLUMNAS.tarifa).eq('studio_id', ctx.studioId);
    if (req.nextUrl.searchParams.get('activas') === 'true') q = q.eq('activo', true);
    const { data, error: errorBd } = await q.order('nombre', { ascending: true }).limit(500);
    if (errorBd) return error(500, 'server_error', 'No se pudo leer el catálogo.', ctx.requestId);
    return { status: 200, body: (data ?? []).map((f) => tarifaPublica(f as unknown as Record<string, unknown>)) };
  });
}
