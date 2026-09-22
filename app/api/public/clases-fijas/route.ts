import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { resolverStudioPorSlug, socioAutenticado } from '@/lib/db/supabase-data-admin';
import { catalogoClasesFijas } from '@/lib/db/clases-fijas';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import { paginaCerradaParaPeticion } from '@/lib/publico/pagina-cerrada-peticion';

export const dynamic = 'force-dynamic';

// Las clases fijas que el estudio ofrece a sus alumnas (migr clases_fijas_del_estudio):
// nombre, qué clases incluye, cuánto tiempo se puede pedir y si queda sitio. Es lo
// mismo para cualquier visitante; con la sesión de una alumna del estudio añade SUS
// peticiones pendientes.
//
// SEGURIDAD: nada de PII. Las plazas libres salen como número, nunca quién las
// tiene, y la identidad de la alumna sale del JWT verificado, no del body. Con la
// página oculta y sin su pase, una oferta vacía (el mismo criterio que el resto de
// datos públicos: sin pase no sale el catálogo).
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public-clases-fijas', { max: 60, windowSeconds: 60 });
  if (limited) return limited;
  const body = await req.json().catch(() => null) as { slug?: unknown } | null;
  const slug = typeof body?.slug === 'string' ? body.slug.trim() : '';
  if (!slug) return NextResponse.json({ error: 'Falta el estudio' }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  try {
    const estudio = await resolverStudioPorSlug(admin as never, slug);
    if (!estudio) return NextResponse.json({ error: 'Estudio no encontrado' }, { status: 404 });
    const studioId = String(estudio.row.id);

    const cerrada = await paginaCerradaParaPeticion(req, studioId);
    if (cerrada) return NextResponse.json({ ofertas: [], sueltas: [], pedidas: [] });

    const user = await verificarUsuarioSupabase(req);
    const socioId = user ? await socioAutenticado(user.userId, studioId) : null;
    const puedePedirPlazaFija = estudio.row.plaza_fija_solicitar_desde_app === true;
    return NextResponse.json(await catalogoClasesFijas(admin, studioId, socioId, puedePedirPlazaFija), { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorInterno('public/clases-fijas:POST', err, 'No se han podido cargar las clases fijas.');
  }
}
