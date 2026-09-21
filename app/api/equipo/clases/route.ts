import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { puedeGestionarEquipo } from '@/lib/permisos-reglas';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { instructorasGestionables, rangoMesEstudio } from '@/lib/fichaje/jornadas-equipo';
import { corregirClases, listarClasesEquipo, marcarRevisada, resumirClases, type CorreccionClase } from '@/lib/fichaje/clases-equipo';
import { rolesPorInstructor } from '@/lib/equipo/liquidacion-datos';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';

// «Equipo → Tiempo trabajado», las clases del mes: si cada una se dio y a qué
// hora. Mismo gate y mismo filtro de fichas que las jornadas: solo quien gestiona
// el equipo, y de las fichas que puede gestionar. El estudio sale de la sesión.

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'equipo-clases-listar', { max: 60, windowSeconds: 60 });
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
    const { clases, cambios } = await listarClasesEquipo(admin, {
      studioId: sesion.studioId, ...rango, instructorIds: instructorasGestionables(sesion.rol, roles),
    });
    return NextResponse.json({ clases, cambios, resumen: resumirClases(clases) });
  } catch (err) {
    return errorInterno('equipo/clases:GET', err, 'No hemos podido cargar las clases del mes.');
  }
}

// Corregir (dada a su hora, con otro horario o no dada; motivo obligatorio) o
// marcar como revisada una clase que la instructora dijo no dar. Una clase de otro
// estudio o de una ficha que no puede gestionar responde 404 sin decir cuál.
export async function PATCH(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'equipo-clases-editar', { max: 30, windowSeconds: 60 });
  if (limited) return limited;

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarEquipo(sesion.rol)) {
    return NextResponse.json({ error: 'No tienes permiso para corregir clases' }, { status: 403 });
  }

  const body = await req.json().catch(() => null) as
    { accion?: unknown; items?: unknown; motivo?: unknown; sesionId?: unknown } | null;
  const accion = body?.accion;
  const items: CorreccionClase[] = [];
  if (accion === 'corregir') {
    if (!Array.isArray(body?.items) || typeof body?.motivo !== 'string') return NextResponse.json({ error: 'Petición no válida' }, { status: 400 });
    for (const it of body.items as Record<string, unknown>[]) {
      if (!it || typeof it.sesionId !== 'string' || (it.estado !== 'DADA' && it.estado !== 'NO_DADA')
        || (it.inicio !== undefined && typeof it.inicio !== 'string') || (it.fin !== undefined && typeof it.fin !== 'string')) {
        return NextResponse.json({ error: 'Petición no válida' }, { status: 400 });
      }
      items.push({ sesionId: it.sesionId, estado: it.estado, inicio: it.inicio as string | undefined, fin: it.fin as string | undefined });
    }
  } else if (accion !== 'revisar' || typeof body?.sesionId !== 'string') {
    return NextResponse.json({ error: 'Petición no válida' }, { status: 400 });
  }

  try {
    const admin = getSupabaseAdmin();
    if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
    const gestionables = instructorasGestionables(sesion.rol, await rolesPorInstructor(admin, sesion.studioId));
    const ctx = { studioId: sesion.studioId, userId: sesion.userId };
    const r = accion === 'corregir'
      ? await corregirClases(admin, ctx, gestionables, items, body!.motivo as string)
      : await marcarRevisada(admin, ctx, gestionables, body!.sesionId as string);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true, corregidas: r.corregidas });
  } catch (err) {
    return errorInterno('equipo/clases:PATCH', err, 'No hemos podido guardar el cambio.');
  }
}
