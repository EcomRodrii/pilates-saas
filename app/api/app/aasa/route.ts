import { NextResponse } from 'next/server';
import { appIdDeEstudio, contenidoAasa, idsDeApps, type AppDeEstudioAasa } from '@/lib/app-nativa/aasa';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';

// Se sirve en /.well-known/apple-app-site-association (rewrite en next.config.ts).
// iOS lo pide al instalar la app y lo cachea: JSON sin redirecciones.
export const dynamic = 'force-dynamic';

export async function GET() {
  const ids = idsDeApps();
  if (ids.length === 0) return new NextResponse('No configurado', { status: 404 });

  // Las apps de estudio ACTIVAS. Si no se pueden leer, 503 y no el fichero sin ellas:
  // iOS cachea lo que recibe, y uno recortado dejaría sin enlaces a esas apps durante días.
  const apps: AppDeEstudioAasa[] = [];
  const admin = getSupabaseAdmin();
  if (admin) {
    const { data, error } = await admin.from('apps_estudio').select('studio_id, bundle_id, studios!inner(slug, cadena_id)').eq('activa', true);
    if (error) return new NextResponse('No disponible', { status: 503, headers: { 'Cache-Control': 'no-store' } });
    const filas = (data ?? []) as unknown as { studio_id: string; bundle_id: string; studios: { slug: string | null; cadena_id: string | null } }[];
    // La app de una cadena (la de su sede PRINCIPAL) abre las páginas de sus sedes, salvo las que
    // tienen app propia (la piloto de una sede secundaria), que se quedan con la suya.
    const cadenas = [...new Set(filas.map((f) => f.studios?.cadena_id).filter((c): c is string => !!c))];
    const sedesDe = new Map<string, { id: string; slug: string | null }[]>();
    // Con fila propia en cualquier estado (como `estudioDeLaApp`), no solo las activas.
    const conAppPropia = new Set(filas.map((f) => f.studio_id));
    if (cadenas.length > 0) {
      const { data: propias, error: errPropias } = await admin.from('apps_estudio').select('studio_id');
      if (errPropias) return new NextResponse('No disponible', { status: 503, headers: { 'Cache-Control': 'no-store' } });
      for (const p of (propias ?? []) as { studio_id: string }[]) conAppPropia.add(p.studio_id);
      const { data: sedes, error: errSedes } = await admin.from('studios').select('id, slug, cadena_id').in('cadena_id', cadenas)
        .order('creado_en', { ascending: true, nullsFirst: false }).order('id', { ascending: true });
      if (errSedes) return new NextResponse('No disponible', { status: 503, headers: { 'Cache-Control': 'no-store' } });
      for (const s of (sedes ?? []) as { id: string; slug: string | null; cadena_id: string }[]) {
        sedesDe.set(s.cadena_id, [...(sedesDe.get(s.cadena_id) ?? []), s]);
      }
    }
    for (const f of filas) {
      const appId = appIdDeEstudio(process.env.APPLE_TEAM_ID, f.bundle_id);
      if (!appId || !f.studios?.slug) continue;
      const deLaCadena = f.studios.cadena_id ? sedesDe.get(f.studios.cadena_id) ?? [] : [];
      const esPrincipal = deLaCadena[0]?.id === f.studio_id;
      const otras = esPrincipal ? deLaCadena.filter((x) => x.id !== f.studio_id && !conAppPropia.has(x.id) && x.slug).map((x) => x.slug as string) : [];
      for (const slug of [f.studios.slug, ...otras]) apps.push({ appId, slug });
    }
  }
  return NextResponse.json(contenidoAasa(ids, apps), { headers: { 'Cache-Control': 'public, max-age=3600' } });
}
