import { NextResponse } from 'next/server';
import { contenidoAasa, idsDeApps } from '@/lib/app-nativa/aasa';

// Se sirve en /.well-known/apple-app-site-association (rewrite en next.config.ts).
// iOS lo pide al instalar la app y lo cachea: JSON sin redirecciones.
export const dynamic = 'force-dynamic';

export function GET() {
  const ids = idsDeApps();
  if (ids.length === 0) return new NextResponse('No configurado', { status: 404 });
  return NextResponse.json(contenidoAasa(ids), { headers: { 'Cache-Control': 'public, max-age=3600' } });
}
