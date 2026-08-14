import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { errorInterno } from '@/lib/errores-servidor';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';

export const runtime = 'nodejs';

// GET /api/theme/importado — lista los ZIP importados de ESTE estudio, para
// pintar "borrador"/"publicado" en el panel. Cualquier miembro del staff
// puede leer (mismo alcance que la RLS `read_theme_imports`); publicar/
// despublicar/borrar exige PROPIETARIO, gate que vive en cada acción.
export async function GET(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servicio no disponible' }, { status: 503 });

  const { data, error } = await admin
    .from('theme_imports')
    .select('id, nombre, manifest, estado, detalle, publicado, publicado_en, creado_en')
    .eq('studio_id', sesion.studioId)
    .order('creado_en', { ascending: false });
  if (error) return errorInterno('theme:importado:listar', error, 'No se han podido cargar los temas importados.');

  return NextResponse.json({ temas: data });
}
