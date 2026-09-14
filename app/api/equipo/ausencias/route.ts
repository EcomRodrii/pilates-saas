import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeGestionarEquipo, puedeVerDetalleAusencias } from '@/lib/permisos-reglas';
import { ausenciaVisiblePara } from '@/lib/ausencias';
import { errorInterno } from '@/lib/errores-servidor';
import { borrarAusencia, crearAusencia, listarAusencias } from '@/lib/sustituciones/ausencias-servidor';

// Ausencias de instructoras (vacaciones / baja médica / otro), desde el panel.
// La lógica (bloqueos materializados, marcha atrás, clases afectadas, aviso) vive
// en `lib/sustituciones/ausencias-servidor.ts`, compartida con la app del
// estudio; aquí se decide quién es quién y qué puede tocar.
//
// Todo acotado al estudio de la sesión de staff: nunca se fía del cliente.
//
// Autoservicio de instructora (quinto tramo): puede registrar/borrar SU
// PROPIA ausencia, resuelta siempre en servidor (nunca el `instructorId` que
// venga en el body/query) — mismo patrón ya usado en app/api/sustituciones
// (POST) para "no puedo asistir". No hace falta un endpoint separado (a
// diferencia de disponibilidad): aquí no hay dos mecanismos de auth distintos
// que mezclar, todo pasa por `verificarSesionStaff`.

export const dynamic = 'force-dynamic';

async function resolverPropioInstructorId(
  admin: ReturnType<typeof getSupabaseAdmin> & {},
  userId: string, studioId: string,
): Promise<string | null> {
  // limit(1) en vez de maybeSingle(): no hay UNIQUE(auth_user_id, studio_id)
  // en `instructores` — una ficha duplicada rompería maybeSingle() y dejaría
  // a una instructora legítima sin poder gestionar su ausencia.
  const { data } = await admin
    .from('instructores').select('id')
    .eq('auth_user_id', userId).eq('studio_id', studioId)
    .neq('activo', false).order('id', { ascending: true }).limit(1);
  return (data?.[0]?.id as string | undefined) ?? null;
}

export async function GET(req: NextRequest) {
  const staff = await verificarSesionStaff(req);
  if (!staff) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ items: [] });

  // Una instructora solo ve las SUYAS — ignora cualquier `instructorId` del
  // query string, no vaya a pedir el de una compañera cambiando el parámetro.
  let instructorId = req.nextUrl.searchParams.get('instructorId');
  if (staff.rol === 'INSTRUCTOR') {
    instructorId = await resolverPropioInstructorId(admin, staff.userId, staff.studioId);
    if (!instructorId) return NextResponse.json({ items: [] });
  }

  try {
    const items = await listarAusencias(admin, {
      studioId: staff.studioId, alcance: instructorId ? { instructorId } : 'estudio',
    });

    // Tipo y motivo solo para quien gestiona el equipo, o para la instructora
    // sobre las suyas (arriba ya se acotó a ellas). Recepción, que asigna clases
    // en el calendario, se lleva quién y qué días. Espejo de la RLS
    // `ausencias_gestion` (migr 20260914000209): esta ruta va con service-role y
    // la RLS no la ve, así que el recorte tiene que estar AQUÍ también.
    const verDetalle = staff.rol === 'INSTRUCTOR' || puedeVerDetalleAusencias(staff.rol);
    return NextResponse.json({ items: items.map(a => ausenciaVisiblePara(a, verDetalle)) });
  } catch (err) {
    return errorInterno('equipo:ausencias:GET', err, 'No se han podido cargar las ausencias');
  }
}

export async function POST(req: NextRequest) {
  const staff = await verificarSesionStaff(req);
  if (!staff) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const esInstructoraPropia = staff.rol === 'INSTRUCTOR';
  if (!puedeGestionarEquipo(staff.rol) && !esInstructoraPropia) {
    return NextResponse.json({ error: 'No tienes permiso para gestionar ausencias del equipo' }, { status: 403 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const b = (await req.json().catch(() => null)) as
    | { instructorId?: string; tipo?: string; desde?: string; hasta?: string; motivo?: string }
    | null;

  // Si es la propia instructora, el destino se resuelve en SERVIDOR — nunca
  // el `instructorId` que venga en el body, aunque lo mande.
  let instructorId = b?.instructorId;
  if (esInstructoraPropia) {
    instructorId = (await resolverPropioInstructorId(admin, staff.userId, staff.studioId)) ?? undefined;
    if (!instructorId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const r = await crearAusencia(admin, {
    studioId: staff.studioId, instructorId, tipo: b?.tipo, desde: b?.desde, hasta: b?.hasta, motivo: b?.motivo,
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, id: r.id, clasesAfectadas: r.clasesAfectadas });
}

export async function DELETE(req: NextRequest) {
  const staff = await verificarSesionStaff(req);
  if (!staff) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const esInstructoraPropia = staff.rol === 'INSTRUCTOR';
  if (!puedeGestionarEquipo(staff.rol) && !esInstructoraPropia) {
    return NextResponse.json({ error: 'No tienes permiso para gestionar ausencias del equipo' }, { status: 403 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const b = (await req.json().catch(() => null)) as { id?: string } | null;
  if (!b?.id) return NextResponse.json({ error: 'Falta id' }, { status: 400 });

  // Quien gestiona el equipo borra cualquiera del estudio; la instructora, solo la suya.
  let alcance: 'estudio' | { instructorId: string } = 'estudio';
  if (esInstructoraPropia) {
    const instructorId = await resolverPropioInstructorId(admin, staff.userId, staff.studioId);
    if (!instructorId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    alcance = { instructorId };
  }

  const r = await borrarAusencia(admin, { studioId: staff.studioId, id: b.id, alcance });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true });
}
