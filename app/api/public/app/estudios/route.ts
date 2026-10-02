import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import { urlIconoEstudio } from '@/lib/monograma-estudio';
import { textoBusquedaEstudio } from '@/lib/app-nativa/buscar-estudio';
import { escaparLike } from '@/lib/escapar-like';

export const dynamic = 'force-dynamic';

// GET /api/public/app/estudios?q= — «Busca tu estudio» en la app de iOS, para quien
// todavía no tiene cuenta: se da de alta en la app de SU estudio, que es donde da
// su consentimiento. Lo mismo que ya es público en /reservar/<slug> (nombre, dónde
// está e icono), solo de estudios con la página abierta, y con tope por IP para que
// no sirva de directorio que se baja entero.
export async function GET(req: NextRequest) {
  const limitado = await enforceRateLimit(req, 'app-buscar-estudio', { max: 30, windowSeconds: 600 });
  if (limitado) return limitado;
  const texto = textoBusquedaEstudio(req.nextUrl.searchParams.get('q'));
  if (!texto) return NextResponse.json({ estudios: [] });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'sin service-role' }, { status: 500 });

  try {
    const { data, error } = await admin.from('studios')
      .select('slug, nombre, ciudad, logo_url, color_primario')
      .ilike('nombre', `%${escaparLike(texto)}%`)
      .not('slug', 'is', null)
      .not('pagina_publica_oculta', 'is', true)
      .order('nombre', { ascending: true })
      .limit(8);
    if (error) throw error;
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? null;
    const estudios = (data ?? []).map((s) => ({
      slug: s.slug as string,
      nombre: (s.nombre as string | null) ?? (s.slug as string),
      ciudad: (s.ciudad as string | null) ?? null,
      icono: urlIconoEstudio(s.nombre as string | null, s.color_primario as string | null, 192, { logoUrl: s.logo_url as string | null }, base),
    }));
    return NextResponse.json({ estudios }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorInterno('public/app/estudios:GET', err, 'No se ha podido buscar. Inténtalo de nuevo.');
  }
}
