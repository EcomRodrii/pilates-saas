import { NextRequest } from 'next/server';
import { conApiPublica, error, sedesDeLaCredencial } from '@/lib/api-publica/servidor';

// GET /api/v1/estudios — las sedes a las que llega la credencial. Con una clave
// de sede o un token OAuth, solo la suya; con una clave de cadena, las sedes de
// la cadena a las que llega AHORA (lib/api-publica/cadena.ts): cada una se pide
// después con la cabecera Tentare-Estudio.
//
// La única ruta que una clave de cadena puede llamar sin esa cabecera
// (`sinSede`): no lee datos de ninguna sede, solo dice cuáles hay.
export async function GET(req: NextRequest) {
  return conApiPublica(req, { scope: null, ruta: '/api/v1/estudios', sinSede: true }, async (ctx, admin) => {
    const sedes = await sedesDeLaCredencial(admin, ctx);
    if (!sedes) return error(500, 'server_error', 'No se pudieron leer las sedes.', ctx.requestId);
    return { status: 200, body: sedes };
  });
}
