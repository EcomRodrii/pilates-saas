import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';

// GET /api/valoraciones — resumen (media + total) por instructora del estudio,
// para pintar las estrellas en Equipo y en el ranking de sustituciones.
export async function GET(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { data, error } = await admin.rpc('valoraciones_resumen_estudio', { p_studio_id: sesion.studioId });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Mapa instructor_id → { media, total } para lookup O(1) en la UI.
  const resumen: Record<string, { media: number; total: number }> = {};
  for (const r of (data ?? []) as { instructor_id: string; media: number | string; total: number | string }[]) {
    resumen[r.instructor_id] = { media: Number(r.media), total: Number(r.total) };
  }
  return NextResponse.json({ resumen });
}
