import { NextRequest, NextResponse } from 'next/server';
import { historialAsistidasPublico, socioAutenticado } from '@/lib/db/supabase-data-admin';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';

// Historial de clases asistidas de la socia, para la sección «Completadas» de
// su agenda.
//
// Exige sesión real de socia (JWT de Supabase Auth) y la identidad se deriva
// del token verificado, NUNCA del body — mismo criterio que `canje` y
// `favoritos`. Si el `socioId` llegara del cliente, cualquiera podría leer a
// qué clases va otra socia del mismo estudio, que es dato personal.
//
// ⚠️ Es un endpoint aparte y no un campo más del catálogo público a propósito:
// `fetchPublicStudioData` acota las sesiones a `fin >= ahora` y ensancharla
// hacia atrás habría metido meses de historia en CADA carga de CADA portal,
// también los que no enseñan historial. Esto se pide solo al abrir la lista.
//
// POST y no GET porque el `studioId` viaja en el body como en el resto de
// endpoints públicos del portal (`postPublico`, lib/studio-context.tsx), y para
// que ningún id acabe en la URL ni en los logs del CDN. No muta nada.
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public-historial', { max: 30, windowSeconds: 60 });
  if (limited) return limited;

  const body = await req.json().catch(() => null) as { studioId?: string; limite?: number } | null;
  if (!body?.studioId) {
    return NextResponse.json({ error: 'Falta el estudio' }, { status: 400 });
  }

  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const socioId = await socioAutenticado(user.userId, body.studioId);
  if (!socioId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const clases = await historialAsistidasPublico({
      studioId: body.studioId, socioId, limite: body.limite,
    });
    return NextResponse.json({ clases });
  } catch (err) {
    return errorInterno('public/historial:POST', err,
      'No hemos podido cargar tu historial. Vuelve a intentarlo.');
  }
}
