import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno } from '@/lib/errores-servidor';
import { calcularDependenciaEstudio } from '@/lib/instructor-dependency';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/instructors/dependency_risk/recalcular
// Recalcula on-demand el riesgo de concentración del estudio en sesión y
// devuelve los snapshots frescos. Solo staff autenticado (su propio estudio).
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Service role no configurada' }, { status: 503 });

  try {
    await calcularDependenciaEstudio(admin, sesion.studioId);
    const { data } = await admin
      .from('instructor_dependency_snapshots')
      .select('*')
      .eq('studio_id', sesion.studioId);
    return NextResponse.json({ ok: true, snapshots: data ?? [] });
  } catch (e) {
    return errorInterno('dependency_risk:recalcular', e,
      'No se ha podido recalcular el riesgo por instructora. Inténtalo de nuevo en unos minutos.');
  }
}
