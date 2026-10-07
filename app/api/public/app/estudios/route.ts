import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import { coincideEstudio, textoBusquedaEstudio, vocalesComodin } from '@/lib/app-nativa/buscar-estudio';
import { marcaDelEstudio } from '@/lib/app-nativa/icono-estudio';
import { escaparLike } from '@/lib/escapar-like';

export const dynamic = 'force-dynamic';

// GET /api/public/app/estudios?q= — «Busca tu estudio» en la app de iOS, para quien
// todavía no tiene cuenta: se da de alta en la app de SU estudio, que es donde da
// su consentimiento. Lo mismo que ya es público en /reservar/<slug> (nombre, dónde
// está, icono y color de marca), solo de estudios con la página abierta, y con
// tope por IP para que no sirva de directorio que se baja entero.
//
// Sin tildes ni mayúsculas: «nucleo» encuentra «Núcleo». La base trae de más
// (cada vocal es comodín de una letra) y aquí se filtra de verdad.
export async function GET(req: NextRequest) {
  const limitado = await enforceRateLimit(req, 'app-buscar-estudio', { max: 30, windowSeconds: 600 });
  if (limitado) return limitado;
  const texto = textoBusquedaEstudio(req.nextUrl.searchParams.get('q'));
  if (!texto) return NextResponse.json({ estudios: [] });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'sin service-role' }, { status: 500 });

  try {
    const { data, error } = await admin.from('studios')
      .select('id, slug, nombre, ciudad, logo_url, color_primario')
      .ilike('nombre', `%${vocalesComodin(escaparLike(texto))}%`)
      .not('slug', 'is', null)
      .not('pagina_publica_oculta', 'is', true)
      .order('nombre', { ascending: true })
      .limit(40);
    if (error) throw error;
    const filas = (data ?? []).filter((s) => coincideEstudio((s.nombre as string | null) ?? '', texto)).slice(0, 8);
    const estudios = await Promise.all(filas.map(async (s) => ({
      slug: s.slug as string,
      nombre: (s.nombre as string | null) ?? (s.slug as string),
      ciudad: (s.ciudad as string | null) ?? null,
      // El icono y el color de su tema: con el color, la lista pinta la inicial
      // mientras el icono llega (o si no llega), en vez de un hueco vacío.
      ...await marcaDelEstudio({
        id: s.id as string, nombre: s.nombre as string | null, logo_url: s.logo_url as string | null, color_primario: s.color_primario as string | null,
      }),
    })));
    return NextResponse.json({ estudios }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorInterno('public/app/estudios:GET', err, 'No se ha podido buscar. Inténtalo de nuevo.');
  }
}
