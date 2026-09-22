import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { guardarOferta, listarOfertasStaff, validarDatosOferta } from '@/lib/db/clases-fijas';
import { puedeGestionarCalendario } from '@/lib/permisos-reglas';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';

export const dynamic = 'force-dynamic';

// Clases fijas del estudio (migr clases_fijas_del_estudio): las ofertas que arma el
// estudio con clases que ya se repiten, para que sus alumnas las pidan desde la app.
//
// ⚠️ Service-role: las tablas no tienen políticas RLS y todo pasa por aquí. El
// estudio sale SIEMPRE de la sesión, nunca del body, y el permiso es el de
// gestionar el calendario (la oferta se apoya en sus series). Aprobar las
// peticiones no está aquí: va por `/api/plazas-fijas/solicitudes`.

function permitido(rol: Parameters<typeof puedeGestionarCalendario>[0]) {
  return puedeGestionarCalendario(rol);
}

// GET → todas las ofertas (también las cerradas), con su estado contra el horario vivo.
export async function GET(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!permitido(sesion.rol)) return NextResponse.json({ error: 'No tienes permiso para esto' }, { status: 403 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
  try {
    return NextResponse.json({ ok: true, clases: await listarOfertasStaff(admin, sesion.studioId) });
  } catch (err) {
    return errorInterno('clases-fijas:GET', err, 'No se han podido cargar las clases fijas. Recarga la página.');
  }
}

async function escribir(req: NextRequest, modo: 'crear' | 'editar') {
  const limitado = await enforceRateLimit(req, 'clases-fijas-escribir', { max: 30, windowSeconds: 60 });
  if (limitado) return limitado;
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!permitido(sesion.rol)) return NextResponse.json({ error: 'No tienes permiso para esto' }, { status: 403 });

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const id = modo === 'editar' ? (typeof body?.id === 'string' ? body.id : null) : null;
  if (modo === 'editar' && !id) return NextResponse.json({ error: 'Falta la clase fija' }, { status: 400 });
  const v = validarDatosOferta(body, modo === 'editar');
  if ('error' in v) return NextResponse.json({ error: v.error }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
  try {
    const r = await guardarOferta(admin, { studioId: sesion.studioId, id: id ?? undefined, datos: v.datos });
    if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true, id: r.id });
  } catch (err) {
    return errorInterno('clases-fijas:escribir', err, 'No se ha podido guardar la clase fija. Inténtalo de nuevo.');
  }
}

// POST { nombre, descripcion?, duracionesMeses?, plazas?, franjas:[{serieId,diaSemana}] } → la crea.
export async function POST(req: NextRequest) {
  return escribir(req, 'crear');
}

// PATCH { id, …campos que cambian… } → la edita, la cierra (`activa: false`) o la reabre.
export async function PATCH(req: NextRequest) {
  return escribir(req, 'editar');
}
