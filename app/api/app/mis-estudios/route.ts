import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno } from '@/lib/errores-servidor';
import { urlIconoEstudio } from '@/lib/monograma-estudio';
import { estudiosDeLaCuenta, type FilaEstudioCuenta } from '@/lib/app-nativa/mis-estudios';

export const dynamic = 'force-dynamic';

// GET /api/app/mis-estudios — la entrada de la app de iOS (`/app`): con la sesión
// de la persona, en qué estudios está y cómo (alumna o instructora), para llevarla
// a la app de SU estudio. Solo los estudios de quien pregunta (identidad del JWT,
// nunca un id que llegue en la petición) y solo lo que se enseña en la lista:
// nombre, dirección de su app e icono.
export async function GET(req: NextRequest) {
  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'sin service-role' }, { status: 500 });

  try {
    const [socias, equipo] = await Promise.all([
      admin.from('socios').select('studio_id').eq('auth_user_id', user.userId).is('borrado_en', null),
      admin.from('instructores').select('studio_id').eq('auth_user_id', user.userId).neq('activo', false),
    ]);
    if (socias.error) throw socias.error;
    if (equipo.error) throw equipo.error;
    const ids = [...new Set([...(socias.data ?? []), ...(equipo.data ?? [])].map(f => f.studio_id as string))];
    if (ids.length === 0) return NextResponse.json({ estudios: [] }, { headers: { 'Cache-Control': 'no-store' } });

    const { data: studios, error } = await admin.from('studios')
      .select('id, slug, nombre, logo_url, color_primario').in('id', ids);
    if (error) throw error;

    const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? null;
    const estudios = estudiosDeLaCuenta(
      (studios ?? []) as FilaEstudioCuenta[],
      new Set((socias.data ?? []).map(f => f.studio_id as string)),
      new Set((equipo.data ?? []).map(f => f.studio_id as string)),
    ).map(({ logo, color, ...e }) => ({ ...e, icono: urlIconoEstudio(e.nombre, color, 192, { logoUrl: logo }, base) }));
    return NextResponse.json({ estudios }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorInterno('app/mis-estudios:GET', err, 'No se han podido cargar tus estudios.');
  }
}
