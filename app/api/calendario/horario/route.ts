import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { fetchAllRows, mapPlazaFija, mapSesion } from '@/lib/supabase-data';
import { construirHorario } from '@/lib/horario-fijo';
import { errorInterno } from '@/lib/errores-servidor';
import type { RowPlazasFijas, RowSesiones } from '@/lib/db-types';

export const dynamic = 'force-dynamic';

// GET /api/calendario/horario — la vista «Horario» del calendario: las clases
// que se repiten agrupadas por serie y día de la semana, hasta cuándo van, si se
// renuevan solas y quién tiene plaza fija (lib/horario-fijo.ts).
//
// `/api/calendario` solo devuelve un rango de fechas; esto necesita TODAS las
// clases futuras, así que va paginado (PostgREST corta a 1.000 filas en
// silencio). Mismo acceso que el calendario: personal del estudio salvo
// INSTRUCTOR, y el estudio sale de la sesión. Solo ids y horarios: los nombres
// los pone el panel con lo que ya tiene.
export async function GET(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol === 'INSTRUCTOR') return NextResponse.json({ error: 'No tienes permiso para esto' }, { status: 403 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  try {
    const ahora = new Date();
    const studioId = sesion.studioId;
    const [sesiones, series, plazas] = await Promise.all([
      fetchAllRows<RowSesiones>(studioId, 'sesiones', (from, to) => admin.from('sesiones')
        .select('*').eq('studio_id', studioId).gte('inicio', ahora.toISOString())
        .order('inicio').order('id').range(from, to)),
      fetchAllRows<{ id: string; renovacion_automatica: boolean; no_renovar: boolean }>(studioId, 'series', (from, to) => admin.from('series')
        .select('id, renovacion_automatica, no_renovar').eq('studio_id', studioId).order('id').range(from, to)),
      fetchAllRows<RowPlazasFijas>(studioId, 'plazas_fijas', (from, to) => admin.from('plazas_fijas')
        .select('*').eq('studio_id', studioId).in('estado', ['ACTIVA', 'PAUSADA']).order('id').range(from, to)),
    ]);
    for (const r of [sesiones, series, plazas]) if (r.error) throw new Error(r.error.message);

    const horario = construirHorario(
      sesiones.data.map(mapSesion),
      series.data.map(s => ({ id: s.id, renovacionAutomatica: s.renovacion_automatica === true, noRenovar: s.no_renovar === true })),
      plazas.data.map(mapPlazaFija),
      ahora.getTime(),
    );
    return NextResponse.json({ ok: true, ...horario });
  } catch (err) {
    return errorInterno('calendario/horario:GET', err, 'No se ha podido cargar el horario.');
  }
}
