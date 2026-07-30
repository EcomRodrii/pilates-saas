import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { leerDisponibilidad, guardarDisponibilidad } from '@/lib/sustituciones/disponibilidad';

// Vía AUTENTICADA (sesión de staff) para que la instructora vea/edite su
// propia disponibilidad desde dentro del panel logueado, sin depender del
// enlace público firmado (que sigue existiendo aparte, para cuando la
// propietaria quiere pedírsela proactivamente antes de que tenga cuenta).
//
// Deliberadamente NO se mezcla con app/api/public/disponibilidad: ese usa un
// mecanismo de auth distinto (token firmado) con su propia superficie de
// validación (enlaceRevocado, caducidad de 30 días) — juntarlos en un mismo
// handler mezclaría dos formas de fallar en la misma función. La lógica de
// negocio (leer/reemplazar filas) SÍ se comparte vía
// lib/sustituciones/disponibilidad.ts.

async function resolverInstructorId(
  admin: ReturnType<typeof getSupabaseAdmin> & {},
  userId: string, studioId: string,
): Promise<string | null> {
  // limit(1) en vez de maybeSingle(): no hay UNIQUE(auth_user_id, studio_id)
  // en `instructores` — una ficha duplicada rompería maybeSingle() y dejaría
  // a una instructora legítima sin poder ver su disponibilidad.
  const { data } = await admin
    .from('instructores').select('id')
    .eq('auth_user_id', userId).eq('studio_id', studioId)
    .neq('activo', false).order('id', { ascending: true }).limit(1);
  return (data?.[0]?.id as string | undefined) ?? null;
}

export async function GET(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol !== 'INSTRUCTOR') return NextResponse.json({ error: 'No tienes permiso para esto' }, { status: 403 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const instructorId = await resolverInstructorId(admin, sesion.userId, sesion.studioId);
  if (!instructorId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const celdas = await leerDisponibilidad(admin, instructorId);
  return NextResponse.json({ celdas });
}

export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol !== 'INSTRUCTOR') return NextResponse.json({ error: 'No tienes permiso para esto' }, { status: 403 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const instructorId = await resolverInstructorId(admin, sesion.userId, sesion.studioId);
  if (!instructorId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { celdas?: unknown } | null;
  const r = await guardarDisponibilidad(admin, { studioId: sesion.studioId, instructorId, celdasRaw: body?.celdas });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 });
  return NextResponse.json({ ok: true, guardadas: r.guardadas });
}
