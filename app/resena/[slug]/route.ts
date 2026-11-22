import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';

// El enlace a la página de reseñas de un estudio, CON SEGUIMIENTO: lo que se imprime en
// el cartel con QR de recepción (`/resena/<slug>`) y lo que pinta el botón de la app
// (`?o=app`). Cuenta el toque (por día y origen, sin datos personales) y redirige al
// enlace que el propio estudio guardó en Configuración.
//
// ⚠️ El destino NUNCA viene en la URL: sale de la base de datos (`registrar_clic_resena`,
// con CHECK de https). Una redirección con destino por parámetro sería una redirección
// abierta, justo lo que un phisher busca en un dominio de confianza.
// No se sabe si la persona llegó a publicar la reseña (Google no lo dice): solo que pinchó.

export const dynamic = 'force-dynamic';

const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!SLUG.test(slug)) return new NextResponse('No encontrado', { status: 404, headers: { 'Cache-Control': 'no-store' } });

  const limited = await enforceRateLimit(req, 'public-resena-clic', { max: 60, windowSeconds: 60 });
  if (limited) return limited;

  const origen = req.nextUrl.searchParams.get('o') === 'app' ? 'app' : 'qr';
  const sinEnlace = () => NextResponse.redirect(new URL(`/portal/${slug}`, req.nextUrl.origin), { status: 302, headers: { 'Cache-Control': 'no-store' } });

  const admin = getSupabaseAdmin();
  if (!admin) return sinEnlace();
  const { data, error } = await admin.rpc('registrar_clic_resena', { p_slug: slug, p_origen: origen });
  if (error || typeof data !== 'string' || !data.startsWith('https://')) return sinEnlace();

  return NextResponse.redirect(data, {
    status: 302,
    headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex' },
  });
}
