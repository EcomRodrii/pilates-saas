import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { puedeGestionarEquipo } from '@/lib/permisos-reglas';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { editarJornada } from '@/lib/fichaje/fichaje-servidor';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';

// Corrección de una jornada por quien gestiona el equipo. El motivo es
// obligatorio y cada campo cambiado queda en `work_session_audits` con su valor
// anterior y el nuevo. El estudio sale de la sesión; la jornada se busca acotada
// a él, así que un id de otro estudio responde 404.
export async function PATCH(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'equipo-jornadas-editar', { max: 30, windowSeconds: 60 });
  if (limited) return limited;

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarEquipo(sesion.rol)) {
    return NextResponse.json({ error: 'No tienes permiso para corregir jornadas' }, { status: 403 });
  }

  const body = await req.json().catch(() => null) as
    { id?: unknown; checkInAt?: unknown; checkOutAt?: unknown; motivo?: unknown } | null;
  if (!body || typeof body.id !== 'string' || typeof body.motivo !== 'string') {
    return NextResponse.json({ error: 'Petición no válida' }, { status: 400 });
  }
  const fecha = (v: unknown) => (typeof v === 'string' ? new Date(v) : undefined);

  try {
    const admin = getSupabaseAdmin();
    if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
    const r = await editarJornada(
      admin, { studioId: sesion.studioId, userId: sesion.userId },
      { id: body.id, checkInAt: fecha(body.checkInAt), checkOutAt: fecha(body.checkOutAt), motivo: body.motivo },
    );
    if (!r.ok) {
      return r.status === 500
        ? errorInterno('equipo/jornadas:PATCH', new Error(r.error), 'No hemos podido guardar el cambio.')
        : NextResponse.json({ error: r.error }, { status: r.status });
    }
    return NextResponse.json({ ok: true, cambios: r.cambios });
  } catch (err) {
    return errorInterno('equipo/jornadas:PATCH', err, 'No hemos podido guardar el cambio.');
  }
}
