import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { resolveStudioIdBySlug } from '@/lib/supabase-data';
import { socioAutenticado } from '@/lib/db/supabase-data-admin';
import { errorInterno } from '@/lib/errores-servidor';
import { enforceRateLimit } from '@/lib/rate-limit';
import { qrDeLaAlumna, regenerarQr } from '@/lib/acceso/qr-alumna-servidor';

// POST /api/public/qr-acceso { slug, regenerar? } → el QR de acceso de la alumna.
//
// Permanente: no caduca ni depende de ninguna reserva. Enseñarlo NO marca nada
// ni abre nada; solo sirve cuando alguien del estudio lo escanea con su sesión
// (`/api/acceso/escanear`), y ahí se decide con su reserva real.
//
// La identidad sale del JWT, nunca del body: el id de socia es público, así que
// aceptarlo del cliente sería dejar que cualquiera pidiera el QR de otra.
//
// `regenerar: true` lo cambia: el anterior deja de valer en el acto. Para una
// captura que ha circulado, un móvil perdido o simplemente por tranquilidad.
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public-qr-acceso', { max: 30, windowSeconds: 60 });
  if (limited) return limited;

  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { slug?: unknown; regenerar?: unknown } | null;
  const slug = typeof body?.slug === 'string' ? body.slug.trim() : '';
  if (!slug) return NextResponse.json({ error: 'Falta el estudio' }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return errorInterno('public/qr-acceso', new Error('sin service-role'), 'No hemos podido preparar tu QR.');

  try {
    const studioId = await resolveStudioIdBySlug(slug);
    if (!studioId) return NextResponse.json({ error: 'Estudio no encontrado' }, { status: 404 });

    const socioId = await socioAutenticado(user.userId, studioId);
    if (!socioId) return NextResponse.json({ error: 'No eres clienta de este estudio' }, { status: 403 });

    const { data: estudio, error } = await admin.from('studios').select('control_acceso_qr').eq('id', studioId).single();
    if (error) return errorInterno('public/qr-acceso', error, 'No hemos podido preparar tu QR.');
    // Apagado: no se crea nada. La app no enseña la sección.
    if (estudio.control_acceso_qr === false) return NextResponse.json({ activo: false as const });

    // Cambiarlo cuenta aparte y más corto: es lo único que escribe.
    if (body?.regenerar === true) {
      const tope = await enforceRateLimit(req, 'public-qr-acceso-regenerar', { max: 5, windowSeconds: 3600 }, user.userId);
      if (tope) return tope;
    }
    const q = { studioId, socioId };
    const qr = body?.regenerar === true ? await regenerarQr(admin, q, 'ALUMNA') : await qrDeLaAlumna(admin, q);
    return NextResponse.json({ activo: true as const, qr: qr.token, creadoEn: qr.creadoEn });
  } catch (err) {
    return errorInterno('public/qr-acceso:POST', err, 'No hemos podido preparar tu QR.');
  }
}
