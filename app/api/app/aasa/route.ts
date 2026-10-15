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
    const { data, error } = await admin.from('apps_estudio').select('bundle_id, studios!inner(slug, cadena_id)').eq('activa', true);
    if (error) return new NextResponse('No disponible', { status: 503, headers: { 'Cache-Control': 'no-store' } });
    const filas = (data ?? []) as unknown as { bundle_id: string; studios: { slug: string | null; cadena_id: string | null } }[];
    // La app de una cadena abre las páginas de TODAS sus sedes (una app por cadena).
    const cadenas = [...new Set(filas.map((f) => f.studios?.cadena_id).filter((c): c is string => !!c))];
    const sedesDe = new Map<string, string[]>();
    if (cadenas.length > 0) {
      const { data: sedes, error: errSedes } = await admin.from('studios').select('slug, cadena_id').in('cadena_id', cadenas);
      if (errSedes) return new NextResponse('No disponible', { status: 503, headers: { 'Cache-Control': 'no-store' } });
      for (const s of (sedes ?? []) as { slug: string | null; cadena_id: string }[]) {
        if (s.slug) sedesDe.set(s.cadena_id, [...(sedesDe.get(s.cadena_id) ?? []), s.slug]);
      }
    }
    for (const f of filas) {
      const appId = appIdDeEstudio(process.env.APPLE_TEAM_ID, f.bundle_id);
      if (!appId || !f.studios?.slug) continue;
      const slugs = [f.studios.slug, ...(f.studios.cadena_id ? sedesDe.get(f.studios.cadena_id) ?? [] : [])];
      for (const slug of slugs) apps.push({ appId, slug });
    }
  }
  return NextResponse.json(contenidoAasa(ids, apps), { headers: { 'Cache-Control': 'public, max-age=3600' } });
}
