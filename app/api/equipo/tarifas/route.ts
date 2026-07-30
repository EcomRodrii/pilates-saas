import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeGestionarEquipo, rolesQuePuedeAsignar } from '@/lib/permisos-reglas';

// Tarifa por hora de una instructora — tabla aparte de `instructores` (ver
// migración 20260731110000_instructor_tarifas.sql) para no filtrar el dato
// salarial en el select('*') compartido de la carga masiva de studio-context.
//
// Mismo patrón que app/api/equipo/ausencias/route.ts: la propia instructora
// solo ve/puede ver SU fila, resuelta siempre en servidor (nunca el
// `instructorId` que venga en el body/query). PROPIETARIO/MANAGER ven y
// escriben las de todo su equipo. RECEPCION no tiene ningún motivo para
// verlas.

export const dynamic = 'force-dynamic';

async function resolverPropioInstructorId(
  admin: ReturnType<typeof getSupabaseAdmin> & {},
  userId: string, studioId: string,
): Promise<string | null> {
  // limit(1) en vez de maybeSingle(): no hay UNIQUE(auth_user_id, studio_id)
  // en `instructores` — mismo motivo que en ausencias/route.ts.
  const { data } = await admin
    .from('instructores').select('id')
    .eq('auth_user_id', userId).eq('studio_id', studioId)
    .neq('activo', false).order('id', { ascending: true }).limit(1);
  return (data?.[0]?.id as string | undefined) ?? null;
}

const TARIFA_MAX = 999.99;

export async function GET(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ items: [] });

  if (!puedeGestionarEquipo(sesion.rol)) {
    if (sesion.rol !== 'INSTRUCTOR') {
      // RECEPCION u otro rol sin motivo para ver tarifas.
      return NextResponse.json({ error: 'No tienes permiso para ver tarifas' }, { status: 403 });
    }
    const instructorId = await resolverPropioInstructorId(admin, sesion.userId, sesion.studioId);
    if (!instructorId) return NextResponse.json({ items: [] });
    const { data } = await admin
      .from('instructor_tarifas')
      .select('instructor_id, tarifa_hora, moneda')
      .eq('studio_id', sesion.studioId)
      .eq('instructor_id', instructorId);
    return NextResponse.json({
      items: (data ?? []).map(r => ({
        instructorId: r.instructor_id, tarifaHora: r.tarifa_hora == null ? null : Number(r.tarifa_hora), moneda: r.moneda,
      })),
    });
  }

  // PROPIETARIO/MANAGER: todas las tarifas del estudio.
  const { data } = await admin
    .from('instructor_tarifas')
    .select('instructor_id, tarifa_hora, moneda')
    .eq('studio_id', sesion.studioId);
  return NextResponse.json({
    items: (data ?? []).map(r => ({
      instructorId: r.instructor_id, tarifaHora: r.tarifa_hora == null ? null : Number(r.tarifa_hora), moneda: r.moneda,
    })),
  });
}

export async function PATCH(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarEquipo(sesion.rol)) {
    return NextResponse.json({ error: 'No tienes permiso para fijar tarifas' }, { status: 403 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const body = (await req.json().catch(() => null)) as
    | { instructorId?: unknown; tarifaHora?: unknown }
    | null;
  const instructorId = typeof body?.instructorId === 'string' ? body.instructorId : null;
  if (!instructorId) return NextResponse.json({ error: 'Falta instructorId' }, { status: 400 });

  let tarifaHora: number | null = null;
  if (body?.tarifaHora !== null && body?.tarifaHora !== undefined) {
    const n = Number(body.tarifaHora);
    if (!Number.isFinite(n) || n < 0 || n > TARIFA_MAX) {
      return NextResponse.json({ error: `La tarifa debe estar entre 0 y ${TARIFA_MAX} €/h` }, { status: 400 });
    }
    tarifaHora = Math.round(n * 100) / 100;
  }

  // La ficha destino debe existir y pertenecer al estudio de la sesión.
  const { data: ficha } = await admin
    .from('instructores').select('id, rol').eq('id', instructorId).eq('studio_id', sesion.studioId).maybeSingle();
  if (!ficha) return NextResponse.json({ error: 'Instructora no encontrada' }, { status: 404 });

  // Un manager no puede fijar la tarifa de la propietaria ni de otro manager —
  // mismo guard que ya usa PATCH /api/equipo para "puedeEditarEsaFicha".
  if (sesion.rol === 'MANAGER' && !rolesQuePuedeAsignar('MANAGER').includes(ficha.rol as never)) {
    return NextResponse.json({ error: 'No puedes fijar la tarifa de esta persona.' }, { status: 403 });
  }

  const { error } = await admin.from('instructor_tarifas').upsert({
    instructor_id: instructorId, studio_id: sesion.studioId, tarifa_hora: tarifaHora,
    actualizado_en: new Date().toISOString(), actualizado_por: sesion.userId,
  }, { onConflict: 'instructor_id' });
  if (error) {
    console.error('[equipo:tarifas]', error.message);
    return NextResponse.json({ error: 'No se ha podido guardar la tarifa' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
