import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno } from '@/lib/errores-servidor';

// GET /api/equipo/stats — métricas por instructora para el rediseño de Equipo:
// valoración media de alumnas (0044) + % de asistencia real (0045). Un solo
// fetch → dos mapas instructor_id → {…} para lookup O(1) en la UI.
export async function GET(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const [val, asis] = await Promise.all([
    admin.rpc('valoraciones_resumen_estudio', { p_studio_id: sesion.studioId }),
    admin.rpc('instructor_asistencia_estudio', { p_studio_id: sesion.studioId }),
  ]);
  if (val.error) return errorInterno('equipo:stats:valoraciones', val.error,
    'No se han podido cargar las estadísticas del equipo. Recarga la página.');
  if (asis.error) return errorInterno('equipo:stats:asistencia', asis.error,
    'No se han podido cargar las estadísticas del equipo. Recarga la página.');

  const valoracion: Record<string, { media: number; total: number }> = {};
  for (const r of (val.data ?? []) as { instructor_id: string; media: number | string; total: number | string }[]) {
    valoracion[r.instructor_id] = { media: Number(r.media), total: Number(r.total) };
  }
  const asistencia: Record<string, { pct: number; base: number }> = {};
  for (const r of (asis.data ?? []) as { instructor_id: string; asistencia_pct: number | string; base: number | string }[]) {
    asistencia[r.instructor_id] = { pct: Number(r.asistencia_pct), base: Number(r.base) };
  }

  return NextResponse.json({ valoracion, asistencia });
}
