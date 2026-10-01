import { NextRequest } from 'next/server';
import { conApiPublica } from '@/lib/api-publica/servidor';

// GET /api/oauth/me — «Probar conexión» de Zapier. Pasa por la MISMA puerta que
// /api/v1 (conApiPublica): antes iba por su cuenta y decía «conectado» aunque el
// estudio estuviera suspendido o quien autorizó ya no tuviera rol, mientras
// todas las llamadas reales daban 401. Lista blanca: nunca el objeto crudo de
// studios/instructores. Los scopes son los que valen HOY.
export async function GET(req: NextRequest) {
  return conApiPublica(req, { scope: null, ruta: '/api/oauth/me' }, async (ctx, admin) => {
    const [{ data: studio }, { data: instructor }] = await Promise.all([
      admin.from('studios').select('id, nombre').eq('id', ctx.studioId).maybeSingle(),
      admin.from('instructores').select('nombre').eq('auth_user_id', ctx.concedidaPor).eq('studio_id', ctx.studioId).maybeSingle(),
    ]);
    return {
      status: 200,
      body: {
        estudio: { id: ctx.studioId, nombre: studio?.nombre ?? null },
        usuario: { nombre: instructor?.nombre ?? null, rol: ctx.rolDeQuienConcedio },
        scopes: ctx.scopes,
      },
    };
  });
}
