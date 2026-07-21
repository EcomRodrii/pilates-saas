import { NextRequest, NextResponse } from 'next/server';
import { crearReservaPublica, cancelarReservaPublica, socioAutenticado } from '@/lib/supabase-data';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';

// Crear o cancelar una reserva desde las páginas públicas (reserva/portal).
// SEGURIDAD: exige sesión real de socia (JWT de Supabase Auth) y deriva su id
// del token verificado — ya NO se acepta {socioId,email} del body, así nadie
// puede reservar/cancelar en nombre de otra socia conociendo su id+email.
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public-reserva', { max: 20, windowSeconds: 60 });
  if (limited) return limited;

  const body = await req.json().catch(() => null) as {
    accion?: 'crear' | 'cancelar';
    studioId?: string;
    sesionId?: string;
    reservaId?: string;
    spotId?: string | null;
  } | null;

  if (!body?.studioId) {
    return NextResponse.json({ error: 'Falta el estudio' }, { status: 400 });
  }

  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const socioId = await socioAutenticado(user.userId, body.studioId);
  if (!socioId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    if (body.accion === 'crear') {
      if (!body.sesionId) return NextResponse.json({ error: 'Falta la sesión' }, { status: 400 });
      const r = await crearReservaPublica({
        studioId: body.studioId, sesionId: body.sesionId, socioId, email: user.email, spotId: body.spotId ?? null,
      });
      if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.error === 'No autorizado' ? 401 : 400 });
      return NextResponse.json(r);
    }
    if (body.accion === 'cancelar') {
      if (!body.reservaId) return NextResponse.json({ error: 'Falta la reserva' }, { status: 400 });
      const r = await cancelarReservaPublica({
        studioId: body.studioId, reservaId: body.reservaId, socioId, email: user.email,
      });
      if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.error === 'No autorizado' ? 401 : 400 });
      return NextResponse.json(r);
    }
    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
  } catch (err) {
    return errorInterno('public/reserva:POST', err, 'No se ha podido procesar la reserva.');
  }
}
