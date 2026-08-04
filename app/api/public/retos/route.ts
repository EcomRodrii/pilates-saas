import { NextRequest, NextResponse } from 'next/server';
import { toggleRetoParticipacion, socioAutenticado } from '@/lib/db/supabase-data-admin';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';

// Apunta/desapunta a la socia de un reto del carrusel de Inicio, desde el
// portal. SEGURIDAD: mismo patrón que /api/public/favoritos — exige sesión
// real de socia (JWT de Supabase Auth) y deriva su id del token verificado,
// nunca del body, así nadie puede apuntarse en nombre de otra socia.
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public-retos', { max: 30, windowSeconds: 60 });
  if (limited) return limited;

  const body = await req.json().catch(() => null) as {
    studioId?: string;
    retoKey?: string;
    accion?: 'marcar' | 'desmarcar';
  } | null;

  if (!body?.studioId || !body?.retoKey || !body?.accion) {
    return NextResponse.json({ error: 'Faltan datos' }, { status: 400 });
  }
  if (body.accion !== 'marcar' && body.accion !== 'desmarcar') {
    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
  }

  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const socioId = await socioAutenticado(user.userId, body.studioId);
  if (!socioId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const r = await toggleRetoParticipacion({
      studioId: body.studioId, socioId, retoKey: body.retoKey, accion: body.accion,
    });
    if ('error' in r) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json(r);
  } catch (err) {
    return errorInterno('public/retos:POST', err, 'No se ha podido guardar tu apunte al reto.');
  }
}
