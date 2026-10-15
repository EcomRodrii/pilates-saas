import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import { marcaDelEstudio } from '@/lib/app-nativa/icono-estudio';
import { esBundleDeEstudio } from '@/lib/app-nativa/app-estudio';
import { sedesDeCadena } from '@/lib/app-nativa/app-de-cadena';

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
  const bundle = req.nextUrl.searchParams.get('bundle');
  const slug = req.nextUrl.searchParams.get('slug');
  const porBundle = esBundleDeEstudio(bundle);
  const porSlug = !porBundle && !!slug && /^[a-z0-9-]{1,80}$/.test(slug);
  if (!porBundle && !porSlug) return NextResponse.json({ error: 'Falta el bundle o el slug' }, { status: 400 });

  // Cada arranque en frío de la app pasa por aquí, y en el wifi del estudio (o con la IP compartida
  // del operador) muchas alumnas salen por la misma IP: el tope es por IP Y por app, y holgado. Lo
  // que protege es que esto no sirva para recorrer estudios, no el número de aperturas de una app.
  const limitado = await enforceRateLimit(req, 'app-de-estudio', { max: 300, windowSeconds: 600 }, porBundle ? bundle as string : `slug:${slug}`);
  if (limitado) return limitado;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'sin service-role' }, { status: 500 });

  try {
    // La app y su estudio en una consulta; el estudio se filtra por `studios.slug`.
    const consulta = admin.from('apps_estudio')
      .select('bundle_id, nombre_app, studios!inner(id, slug, nombre, logo_url, color_primario, cadena_id)')
      .eq('activa', true);
    const { data, error } = await (porBundle ? consulta.eq('bundle_id', bundle) : consulta.eq('studios.slug', slug as string)).limit(1);
    if (error) throw error;
    const fila = data?.[0] as unknown as {
      bundle_id: string; nombre_app: string;
      studios: { id: string; slug: string | null; nombre: string | null; logo_url: string | null; color_primario: string | null; cadena_id: string | null };
    } | undefined;
    const s = fila?.studios;
    if (!fila || !s?.slug) return NextResponse.json({ error: 'Esa app no está activa' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });

    const marca = await marcaDelEstudio({ id: s.id, nombre: s.nombre, logo_url: s.logo_url, color_primario: s.color_primario });

    // Una cadena tiene UNA app (su fila va con la sede principal): dentro van sus sedes, la principal
    // primero (`sedesDeCadena`). Solo si ESTA app es la de la principal, y sin las sedes que ya tienen
    // la suya propia (la app piloto de una sede secundaria sigue siendo solo de esa sede). Si no se
    // pueden leer, se corta: una app de cadena que solo enseñara la principal mandaría a las demás
    // alumnas a darse de alta en ella.
    let sedes: { slug: string; nombre: string; icono: string; color: string | null }[] | undefined;
    if (s.cadena_id) {
      const deLaCadena = await sedesDeCadena(admin, s.cadena_id);
      if (deLaCadena[0]?.id === s.id) {
        const ids = deLaCadena.map((x) => x.id);
        const [{ data: filas, error: errSedes }, { data: propias, error: errPropias }] = await Promise.all([
          admin.from('studios').select('id, slug, nombre, logo_url, color_primario').in('id', ids),
          admin.from('apps_estudio').select('studio_id').in('studio_id', ids),
        ]);
        if (errSedes) throw errSedes;
        if (errPropias) throw errPropias;
        const conAppPropia = new Set(((propias ?? []) as { studio_id: string }[]).map((p) => p.studio_id).filter((id) => id !== s.id));
        const porId = new Map(((filas ?? []) as { id: string; slug: string | null; nombre: string | null; logo_url: string | null; color_primario: string | null }[]).map((f) => [f.id, f]));
        const dentro = ids
          .map((id) => porId.get(id))
          .filter((f): f is NonNullable<typeof f> & { slug: string } => !!f && !!f.slug && /^[a-z0-9-]{1,80}$/.test(f.slug) && !conAppPropia.has(f.id));
        if (dentro.length >= 2) {
          sedes = await Promise.all(dentro.map(async (f) => {
            const m = await marcaDelEstudio({ id: f.id, nombre: f.nombre, logo_url: f.logo_url, color_primario: f.color_primario });
            return { slug: f.slug, nombre: f.nombre ?? f.slug, icono: m.icono, color: m.color };
          }));
        }
      }
    }

    return NextResponse.json({
      slug: s.slug,
      nombre: s.nombre ?? s.slug,
      nombreApp: fila.nombre_app,
      bundleId: fila.bundle_id,
      icono: marca.icono,
      color: marca.color,
      ...(sedes ? { sedes } : {}),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorInterno('public/app/app-estudio:GET', err, 'No se ha podido abrir la app. Inténtalo de nuevo.');
  }
}
