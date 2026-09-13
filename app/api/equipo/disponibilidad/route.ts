import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeGestionarEquipo } from '@/lib/permisos-reglas';
import { leerDisponibilidad, guardarDisponibilidad } from '@/lib/sustituciones/disponibilidad';

// Tercera vía para la disponibilidad de una instructora: la marca QUIEN GESTIONA
// EL EQUIPO (propietaria o responsable de sede), por ella.
//
// ⚠️ POR QUÉ. `rankear_candidatas` excluye a quien no tiene franjas, y hasta
// ahora solo la propia instructora podía cargarlas (enlace firmado o «Mi
// perfil»). En un estudio recién abierto, sustituciones no podía proponer a
// nadie hasta que el equipo entero contestara — lo más valorado de la prueba,
// inservible el primer día (evaluación del 13-sep).
//
// Separada a propósito de `mi-disponibilidad` (sesión de la PROPIA instructora)
// y de `public/disponibilidad` (token): cada ruta decide CÓMO se autoriza; la
// lógica de leer/reemplazar filas es la misma (`lib/sustituciones/disponibilidad`).
//
// Autorización en servidor, nunca solo en la UI:
//  · rol con `puedeGestionarEquipo` (PROPIETARIO / MANAGER);
//  · la instructora tiene que ser de la sede activa de la sesión — se comprueba
//    con service-role acotando por `studio_id`, así que un id de otra sede
//    devuelve 404 igual que uno inexistente (no se confirma que exista).
//  La escritura a `instructora_disponibilidad` va por service-role, igual que
//  en las otras dos vías.

async function instructoraDeLaSede(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  instructorId: string,
  studioId: string,
): Promise<boolean> {
  const { data } = await admin
    .from('instructores').select('id')
    .eq('id', instructorId).eq('studio_id', studioId)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

async function autorizar(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) } as const;
  if (!puedeGestionarEquipo(sesion.rol)) {
    return { error: NextResponse.json({ error: 'No tienes permiso para esto' }, { status: 403 }) } as const;
  }
  const admin = getSupabaseAdmin();
  if (!admin) return { error: NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 }) } as const;
  return { sesion, admin } as const;
}

export async function GET(req: NextRequest) {
  const a = await autorizar(req);
  if ('error' in a) return a.error;

  const instructorId = req.nextUrl.searchParams.get('instructorId') ?? '';
  if (!instructorId || !(await instructoraDeLaSede(a.admin, instructorId, a.sesion.studioId))) {
    return NextResponse.json({ error: 'No encuentro a esa instructora en tu estudio' }, { status: 404 });
  }

  const celdas = await leerDisponibilidad(a.admin, instructorId);
  return NextResponse.json({ celdas });
}

export async function POST(req: NextRequest) {
  const a = await autorizar(req);
  if ('error' in a) return a.error;

  const body = (await req.json().catch(() => null)) as { instructorId?: unknown; celdas?: unknown } | null;
  const instructorId = typeof body?.instructorId === 'string' ? body.instructorId : '';
  if (!instructorId || !(await instructoraDeLaSede(a.admin, instructorId, a.sesion.studioId))) {
    return NextResponse.json({ error: 'No encuentro a esa instructora en tu estudio' }, { status: 404 });
  }

  const r = await guardarDisponibilidad(a.admin, { studioId: a.sesion.studioId, instructorId, celdasRaw: body?.celdas });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 });
  return NextResponse.json({ ok: true, guardadas: r.guardadas });
}
