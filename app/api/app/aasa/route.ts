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
    const { data, error } = await admin.from('apps_estudio').select('bundle_id, studios!inner(slug)').eq('activa', true);
    if (error) return new NextResponse('No disponible', { status: 503, headers: { 'Cache-Control': 'no-store' } });
    for (const f of (data ?? []) as unknown as { bundle_id: string; studios: { slug: string | null } }[]) {
      const appId = appIdDeEstudio(process.env.APPLE_TEAM_ID, f.bundle_id);
      if (appId && f.studios?.slug) apps.push({ appId, slug: f.studios.slug });
    }
  }
  return NextResponse.json(contenidoAasa(ids, apps), { headers: { 'Cache-Control': 'public, max-age=3600' } });
}
