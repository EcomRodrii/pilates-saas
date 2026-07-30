import { NextRequest, NextResponse } from 'next/server';
import { toggleFavoritoPublico, socioAutenticado } from '@/lib/db/supabase-data-admin';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';

// Marca/desmarca un tipo de clase como favorito, desde el portal.
// SEGURIDAD: mismo patrón que /api/public/reserva — exige sesión real de
// socia (JWT de Supabase Auth) y deriva su id del token verificado, nunca del
// body, así nadie puede marcar favoritos en nombre de otra socia.
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public-favoritos', { max: 30, windowSeconds: 60 });
  if (limited) return limited;

  const body = await req.json().catch(() => null) as {
    studioId?: string;
    tipoClaseId?: string;
    accion?: 'marcar' | 'desmarcar';
  } | null;

  if (!body?.studioId || !body?.tipoClaseId || !body?.accion) {
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
    const r = await toggleFavoritoPublico({
      studioId: body.studioId, socioId, tipoClaseId: body.tipoClaseId, accion: body.accion,
    });
    if ('error' in r) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json(r);
  } catch (err) {
    return errorInterno('public/favoritos:POST', err, 'No se ha podido guardar el favorito.');
  }
}
