import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { uid } from '@/lib/utils';
import { enforceRateLimit } from '@/lib/rate-limit';
import { verificarTokenValoracion } from '@/lib/valoraciones/token';

// Endpoint PÚBLICO (sin login): la alumna envía su valoración desde el deep link.
// Idempotente por (alumna, clase): reenviar el link o cambiar la nota no duplica.
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public-valorar', { max: 30, windowSeconds: 60 });
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as
    { token?: string; puntuacion?: number; comentario?: string | null } | null;

  const claim = verificarTokenValoracion(body?.token);
  if (!claim) return NextResponse.json({ error: 'Enlace no válido o caducado' }, { status: 401 });

  const puntuacion = Number(body?.puntuacion);
  if (!Number.isInteger(puntuacion) || puntuacion < 1 || puntuacion > 5) {
    return NextResponse.json({ error: 'Puntuación no válida' }, { status: 400 });
  }
  const comentario = typeof body?.comentario === 'string' ? body.comentario.trim().slice(0, 500) || null : null;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  // La clase debe existir y ser de este estudio. La instructora valorada es quien
  // REALMENTE la dio (sesiones.instructor_id — puede ser una sustituta).
  const { data: ses } = await admin
    .from('sesiones').select('instructor_id, studio_id')
    .eq('id', claim.sesionId).eq('studio_id', claim.studioId).maybeSingle();
  if (!ses) return NextResponse.json({ error: 'Clase no encontrada' }, { status: 404 });
  if (!ses.instructor_id) return NextResponse.json({ error: 'Esta clase no tiene instructora asignada' }, { status: 409 });

  const fila = {
    id: `val-${uid()}`,
    studio_id: claim.studioId,
    instructor_id: ses.instructor_id,
    sesion_id: claim.sesionId,
    socio_id: claim.socioId,
    puntuacion,
    comentario,
  };

  const { error } = await admin.from('valoraciones').insert(fila);
  if (error) {
    // Ya había valorado esta clase → actualiza su nota (idempotente, no duplica).
    if (error.code === '23505') {
      const { error: errUpd } = await admin.from('valoraciones')
        .update({ puntuacion, comentario, instructor_id: ses.instructor_id })
        .eq('socio_id', claim.socioId).eq('sesion_id', claim.sesionId);
      if (errUpd) return NextResponse.json({ error: errUpd.message }, { status: 500 });
      return NextResponse.json({ ok: true, actualizada: true });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
