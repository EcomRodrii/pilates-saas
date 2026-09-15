import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { listarPeticionesPlazaFija, resolverPeticionPlazaFija } from '@/lib/db/supabase-data-admin';
import { puedeGestionarCalendario, puedeGestionarClientas } from '@/lib/permisos-reglas';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';

export const dynamic = 'force-dynamic';

// Peticiones de plaza fija que esperan al estudio: las de la app de la alumna
// (una plaza o una pausa) y las vueltas de una pausa que no pudieron volver solas
// (`solicitudes_plaza_fija`, migr 20260916120000).
//
// ⚠️ Service-role: la tabla no tiene políticas RLS y todo pasa por aquí. Va
// acotado al `studio_id` de la sesión y con los dos permisos de
// `/api/plazas-fijas/estado`, porque aprobar hace lo mismo que allí: cambia la
// plaza (`puedeGestionarClientas`) y reserva o cancela clases
// (`puedeGestionarCalendario`).

const MAX_MOTIVO = 200;

function sesionConPermiso(rol: Parameters<typeof puedeGestionarClientas>[0]) {
  return puedeGestionarClientas(rol) && puedeGestionarCalendario(rol);
}

// GET → las pendientes, la más antigua primero.
export async function GET(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!sesionConPermiso(sesion.rol)) return NextResponse.json({ error: 'No tienes permiso para esto' }, { status: 403 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
  try {
    return NextResponse.json({ peticiones: await listarPeticionesPlazaFija(admin, sesion.studioId) });
  } catch (err) {
    return errorInterno('plazas-fijas/solicitudes:GET', err, 'No se han podido cargar las peticiones de plaza fija. Recarga la página.');
  }
}

// POST { id, aprobar, motivo?, confirmarLimite? } → la resuelve.
export async function POST(req: NextRequest) {
  const limitado = await enforceRateLimit(req, 'plazas-fijas-solicitudes-resolver', { max: 30, windowSeconds: 60 });
  if (limitado) return limitado;

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!sesionConPermiso(sesion.rol)) return NextResponse.json({ error: 'No tienes permiso para esto' }, { status: 403 });

  const body = await req.json().catch(() => null) as { id?: unknown; aprobar?: unknown; motivo?: unknown; confirmarLimite?: unknown } | null;
  const id = typeof body?.id === 'string' ? body.id : null;
  if (!id || typeof body?.aprobar !== 'boolean') return NextResponse.json({ error: 'Falta la petición o la decisión' }, { status: 400 });
  // Recorte por caracteres y no por unidades UTF-16: partir un emoji deja un texto que Postgres rechaza.
  const motivo = typeof body.motivo === 'string'
    ? Array.from(body.motivo.trim()).slice(0, MAX_MOTIVO).join('') || null
    : null;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
  try {
    const r = await resolverPeticionPlazaFija(admin, {
      studioId: sesion.studioId, userId: sesion.userId, solicitudId: id,
      aprobar: body.aprobar, motivo, confirmarLimite: body.confirmarLimite === true,
    });
    if ('error' in r) return NextResponse.json({ error: r.error, codigo: r.codigo }, { status: r.status });
    return NextResponse.json(r);
  } catch (err) {
    return errorInterno('plazas-fijas/solicitudes:POST', err, 'No se ha podido guardar la decisión. Inténtalo de nuevo.');
  }
}
