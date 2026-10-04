import { NextRequest, NextResponse } from 'next/server';
import { usuarioSupabaseConPaso } from '@/lib/auth-server';
import { CODIGO_SEGUNDO_PASO } from '@/lib/auth/doble-factor-reglas';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno } from '@/lib/errores-servidor';
import { escaparLike } from '@/lib/escapar-like';
import { iconoDelEstudio } from '@/lib/app-nativa/icono-estudio';
import {
  estudiosComoAlumna, estudiosDeLaCuenta, nombreDePila, type FilaEstudioCuenta,
} from '@/lib/app-nativa/mis-estudios';

export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'no-store' };

// GET /api/app/mis-estudios — la entrada de la app de iOS (`/app`): con la sesión
// de la persona, en qué estudios está y cómo (alumna o instructora), para llevarla
// a la app de SU estudio. Solo los estudios de quien pregunta (identidad del JWT,
// nunca un id que llegue en la petición) y solo lo que se enseña en la lista:
// nombre, ciudad, dirección de su app, icono y su nombre de pila para saludarla.
//
// Es una ruta de ARRANQUE: a una sesión a la que le falta el segundo paso le
// contesta `doble_factor_requerido` (y ningún dato) en vez de un 401, que la
// entrada leería como «sin sesión» y la mandaría a entrar otra vez, en bucle.
//
// Cuenta también las fichas con su email que aún no son suyas (la dio de alta el
// estudio, o vino importada, y nunca ha entrado): el email del JWT lo verificó
// Supabase, y la app del estudio las vincula al entrar con ese mismo criterio
// (`resolverSociaAutenticada`). Sin esto, a esa socia le decíamos «tu cuenta no
// está en ningún estudio».
export async function GET(req: NextRequest) {
  const r = await usuarioSupabaseConPaso(req);
  if (!r) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (r.paso === 'doble_factor') return NextResponse.json({ error: CODIGO_SEGUNDO_PASO }, { status: 403, headers: SIN_CACHE });
  const { userId, email } = r.usuario;
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'sin service-role' }, { status: 500 });

  try {
    const [suyas, porEmail, equipo] = await Promise.all([
      admin.from('socios').select('studio_id, nombre').eq('auth_user_id', userId).is('borrado_en', null),
      admin.from('socios').select('studio_id, nombre')
        .ilike('email', escaparLike(email.trim())).is('auth_user_id', null).is('borrado_en', null),
      admin.from('instructores').select('studio_id, nombre').eq('auth_user_id', userId).neq('activo', false),
    ]);
    if (suyas.error) throw suyas.error;
    if (porEmail.error) throw porEmail.error;
    if (equipo.error) throw equipo.error;
    const comoAlumna = estudiosComoAlumna(suyas.data ?? [], porEmail.data ?? []);
    const comoInstructora = new Set((equipo.data ?? []).map((f) => f.studio_id as string));
    const ids = [...new Set([...comoAlumna, ...comoInstructora])];
    const nombre = nombreDePila([...(suyas.data ?? []), ...(equipo.data ?? []), ...(porEmail.data ?? [])].map((f) => f.nombre as string | null));
    if (ids.length === 0) return NextResponse.json({ estudios: [], nombre }, { headers: SIN_CACHE });

    const { data: studios, error } = await admin.from('studios')
      .select('id, slug, nombre, ciudad, logo_url, color_primario').in('id', ids);
    if (error) throw error;

    const filas = (studios ?? []) as FilaEstudioCuenta[];
    const porId = new Map(filas.map((f) => [f.slug, f]));
    const estudios = await Promise.all(estudiosDeLaCuenta(filas, comoAlumna, comoInstructora).map(async ({ logo, color, ...e }) => {
      const fila = porId.get(e.slug)!;
      return { ...e, icono: await iconoDelEstudio({ id: fila.id, nombre: e.nombre, logo_url: logo, color_primario: color }) };
    }));
    return NextResponse.json({ estudios, nombre }, { headers: SIN_CACHE });
  } catch (err) {
    return errorInterno('app/mis-estudios:GET', err, 'No se han podido cargar tus estudios.');
  }
}
