import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';

// GET /api/valoraciones — resumen (media + total) por instructora del estudio,
// para pintar las estrellas en Equipo y en el ranking de sustituciones.
// Con ?instructorId=… devuelve el DETALLE: cada valoración individual (nota +
// comentario + clase + alumna) para leerlas, no solo la media.
export async function GET(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const instructorId = req.nextUrl.searchParams.get('instructorId');
  if (instructorId) {
    const { data, error } = await admin
      .from('valoraciones')
      .select('id, puntuacion, comentario, creado_en, sesiones(inicio, tipo_clase_id), socios(nombre, apellidos)')
      .eq('studio_id', sesion.studioId)
      .eq('instructor_id', instructorId)
      .order('creado_en', { ascending: false })
      .limit(100);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const items = ((data ?? []) as Array<{
      id: string; puntuacion: number; comentario: string | null; creado_en: string;
      sesiones: { inicio: string; tipo_clase_id: string | null } | { inicio: string; tipo_clase_id: string | null }[] | null;
      socios: { nombre: string; apellidos: string | null } | { nombre: string; apellidos: string | null }[] | null;
    }>).map(v => {
      const ses = Array.isArray(v.sesiones) ? v.sesiones[0] : v.sesiones;
      const soc = Array.isArray(v.socios) ? v.socios[0] : v.socios;
      return {
        id: v.id,
        puntuacion: v.puntuacion,
        comentario: v.comentario,
        creado_en: v.creado_en,
        inicio: ses?.inicio ?? null,
        tipo_clase_id: ses?.tipo_clase_id ?? null,
        alumna: soc ? `${soc.nombre}${soc.apellidos ? ' ' + soc.apellidos : ''}`.trim() : null,
      };
    });
    return NextResponse.json({ items });
  }

  const { data, error } = await admin.rpc('valoraciones_resumen_estudio', { p_studio_id: sesion.studioId });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Mapa instructor_id → { media, total } para lookup O(1) en la UI.
  const resumen: Record<string, { media: number; total: number }> = {};
  for (const r of (data ?? []) as { instructor_id: string; media: number | string; total: number | string }[]) {
    resumen[r.instructor_id] = { media: Number(r.media), total: Number(r.total) };
  }
  return NextResponse.json({ resumen });
}
