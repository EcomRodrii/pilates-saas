import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import { marcaDelEstudio } from '@/lib/app-nativa/icono-estudio';
import { esBundleDeEstudio } from '@/lib/app-nativa/app-estudio';

export const dynamic = 'force-dynamic';

// GET /api/public/app/app-estudio?bundle=<bundle id> | ?slug=<slug> — de qué estudio
// es una app de tienda por estudio (la que sale de la cuenta de Tentare con su
// nombre, icono y color). La entrada de la app (`/app`) lo pregunta al abrirse, y el
// script que compila la app de un estudio lee de aquí su nombre.
//
// Solo contesta por una app ACTIVA (`apps_estudio.activa`): es el interruptor. Sin
// fila activa, 404, y la app se comporta como la genérica. Lo que devuelve ya es
// público (el nombre, el icono y el color del estudio salen igual en el buscador);
// con tope por IP para que no sirva de directorio.
export async function GET(req: NextRequest) {
  const limitado = await enforceRateLimit(req, 'app-de-estudio', { max: 60, windowSeconds: 600 });
  if (limitado) return limitado;

  const bundle = req.nextUrl.searchParams.get('bundle');
  const slug = req.nextUrl.searchParams.get('slug');
  const porBundle = esBundleDeEstudio(bundle);
  const porSlug = !porBundle && !!slug && /^[a-z0-9-]{1,80}$/.test(slug);
  if (!porBundle && !porSlug) return NextResponse.json({ error: 'Falta el bundle o el slug' }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'sin service-role' }, { status: 500 });

  try {
    // La app y su estudio en una consulta; el estudio se filtra por `studios.slug`.
    const consulta = admin.from('apps_estudio')
      .select('bundle_id, nombre_app, studios!inner(id, slug, nombre, logo_url, color_primario)')
      .eq('activa', true);
    const { data, error } = await (porBundle ? consulta.eq('bundle_id', bundle) : consulta.eq('studios.slug', slug as string)).limit(1);
    if (error) throw error;
    const fila = data?.[0] as unknown as {
      bundle_id: string; nombre_app: string;
      studios: { id: string; slug: string | null; nombre: string | null; logo_url: string | null; color_primario: string | null };
    } | undefined;
    const s = fila?.studios;
    if (!fila || !s?.slug) return NextResponse.json({ error: 'Esa app no está activa' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });

    const marca = await marcaDelEstudio({ id: s.id, nombre: s.nombre, logo_url: s.logo_url, color_primario: s.color_primario });
    return NextResponse.json({
      slug: s.slug,
      nombre: s.nombre ?? s.slug,
      nombreApp: fila.nombre_app,
      bundleId: fila.bundle_id,
      icono: marca.icono,
      color: marca.color,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorInterno('public/app/app-estudio:GET', err, 'No se ha podido abrir la app. Inténtalo de nuevo.');
  }
}
