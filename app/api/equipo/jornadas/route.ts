import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { puedeGestionarEquipo } from '@/lib/permisos-reglas';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { editarJornada } from '@/lib/fichaje/fichaje-servidor';
import { instructorasGestionables, listarJornadasEquipo, rangoMesEstudio, resumirPorInstructora } from '@/lib/fichaje/jornadas-equipo';
import { rolesPorInstructor } from '@/lib/equipo/liquidacion-datos';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';

// «Equipo → Tiempo trabajado». Solo quien gestiona el equipo, y de las fichas
// que puede gestionar: una gerente no ve ni corrige las horas de la propietaria
// ni de otra gerente (mismo criterio que tarifas y liquidaciones). El estudio
// sale de la sesión; nada del estudio ni de la ficha viene del cliente sin
// comprobarse contra él.

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'equipo-jornadas-listar', { max: 60, windowSeconds: 60 });
  if (limited) return limited;

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarEquipo(sesion.rol)) {
    return NextResponse.json({ error: 'No tienes permiso para ver el tiempo trabajado' }, { status: 403 });
  }
  const rango = rangoMesEstudio(Number(req.nextUrl.searchParams.get('anio')), Number(req.nextUrl.searchParams.get('mes')));
  if (!rango) return NextResponse.json({ error: 'Falta anio/mes válidos' }, { status: 400 });

  try {
    const admin = getSupabaseAdmin();
    if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
    const roles = await rolesPorInstructor(admin, sesion.studioId);
    const { jornadas, cambios } = await listarJornadasEquipo(admin, {
      studioId: sesion.studioId, ...rango, instructorIds: instructorasGestionables(sesion.rol, roles),
    });
    return NextResponse.json({ jornadas, cambios, resumen: resumirPorInstructora(jornadas) });
  } catch (err) {
    return errorInterno('equipo/jornadas:GET', err, 'No hemos podido cargar el tiempo trabajado.');
  }
}

// Corrección de una jornada. El motivo es obligatorio y cada campo cambiado queda
// en `work_session_audits` con su valor anterior y el nuevo. Una jornada de otro
// estudio, o de una ficha que no puede gestionar, responde 404 sin decir cuál.
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

    const { data: jornada, error } = await admin.from('instructor_work_sessions')
      .select('instructor_id').eq('id', body.id).eq('studio_id', sesion.studioId).maybeSingle();
    if (error) throw error;
    const gestionables = instructorasGestionables(sesion.rol, await rolesPorInstructor(admin, sesion.studioId));
    const ficha = (jornada as { instructor_id: string } | null)?.instructor_id;
    if (!ficha || !gestionables.includes(ficha)) {
      return NextResponse.json({ error: 'Jornada no encontrada' }, { status: 404 });
    }

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
