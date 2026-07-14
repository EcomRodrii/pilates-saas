import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/instructors/dependency_risk
// Devuelve el snapshot de riesgo de concentración más reciente por instructor
// del estudio en sesión, ordenado por nivel de riesgo descendente (ALTO→BAJO) y,
// dentro del mismo nivel, por % de facturación. Solo staff autenticado.
// ─────────────────────────────────────────────────────────────────────────────
const ORDEN_NIVEL: Record<string, number> = { ALTO: 0, MEDIO: 1, BAJO: 2 };

export async function GET(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Service role no configurada' }, { status: 503 });

  const { data, error } = await admin
    .from('instructor_dependency_snapshots')
    .select('*')
    .eq('studio_id', sesion.studioId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const snapshots = (data ?? []).sort((a, b) => {
    const n = (ORDEN_NIVEL[a.nivel_riesgo as string] ?? 3) - (ORDEN_NIVEL[b.nivel_riesgo as string] ?? 3);
    if (n !== 0) return n;
    return Number(b.porcentaje_facturacion ?? 0) - Number(a.porcentaje_facturacion ?? 0);
  });

  return NextResponse.json({ snapshots });
}
