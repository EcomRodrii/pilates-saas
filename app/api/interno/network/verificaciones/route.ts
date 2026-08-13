import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { exigirPermiso } from '@/lib/interno/auth';

export const runtime = 'nodejs';

// Solo lectura a propósito: quién CONFIRMA/RECHAZA una experiencia sigue
// siendo el estudio implicado (app/api/network/verificaciones/resolver),
// nunca el equipo interno de Tentare — esto es supervisión (¿hay algo
// atascado?, ¿hay abuso?), no un atajo para resolver en su lugar.
export async function GET(req: NextRequest) {
  const g = await exigirPermiso(req, 'network.moderate');
  if ('error' in g) return g.error;

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const estado = req.nextUrl.searchParams.get('estado') ?? 'pendiente';

  const { data, error } = await db
    .from('red_verificaciones_experiencia')
    .select(`
      id, estado, solicitado_en, resuelto_en,
      studios ( nombre ),
      red_experiencias ( nombre_estudio, fecha_inicio, fecha_fin, red_perfiles ( nombre ) )
    `)
    .eq('estado', estado)
    .order('solicitado_en', { ascending: false })
    .limit(500);
  if (error) return NextResponse.json({ error: 'No se han podido cargar las verificaciones.' }, { status: 500 });

  type FilaCruda = {
    id: string; estado: string; solicitado_en: string; resuelto_en: string | null;
    studios: { nombre: string | null } | null;
    red_experiencias: {
      nombre_estudio: string; fecha_inicio: string; fecha_fin: string | null;
      red_perfiles: { nombre: string } | null;
    } | null;
  };
  const verificaciones = ((data ?? []) as unknown as FilaCruda[]).map(f => ({
    id: f.id,
    estado: f.estado,
    solicitadoEn: f.solicitado_en,
    resueltoEn: f.resuelto_en,
    estudioNombre: f.studios?.nombre ?? f.red_experiencias?.nombre_estudio ?? 'Estudio',
    profesionalNombre: f.red_experiencias?.red_perfiles?.nombre ?? 'Profesional',
  }));

  return NextResponse.json({ verificaciones });
}
