import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { socioAutenticado } from '@/lib/db/supabase-data-admin';
import { errorInterno } from '@/lib/errores-servidor';
import { enforceRateLimit } from '@/lib/rate-limit';
import { qrDeLaAlumna } from '@/lib/acceso/qr-alumna-servidor';
import { cargarEstudio } from '@/lib/student/estudio';
import { urlIconoEstudio } from '@/lib/monograma-estudio';
import { appUrl } from '@/lib/app-url';
import { configWallet } from '@/lib/wallet/pase';
import { firmarPase } from '@/lib/wallet/firmar-pase';

// El pase de Apple Wallet con el QR de acceso de la alumna (docs/APP-IOS.md,
// «Apple Wallet»).
//
//   GET  ?slug=…        → { disponible }: si el servidor tiene con qué firmar.
//                         Sin datos de nadie: es lo que decide si se pinta el botón.
//   POST { slug }       → el `.pkpass` de la alumna AUTENTICADA.
//
// ⚠️ INERTE hasta tener el certificado «Pass Type ID» (hoy no existe): sin las
// variables `APPLE_WALLET_*`, GET dice `disponible: false` y POST, 503.
//
// SEGURIDAD: mismo patrón que /api/public/qr-acceso — la identidad sale del JWT,
// nunca del body; el pase lleva el MISMO token que ese QR (que tampoco da acceso
// por sí solo: lo decide el estudio al escanearlo, con su reserva real).

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ disponible: configWallet(process.env) !== null });
}

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public-wallet-pase', { max: 10, windowSeconds: 60 });
  if (limited) return limited;

  const config = configWallet(process.env);
  if (!config) return NextResponse.json({ error: 'Apple Wallet todavía no está disponible.' }, { status: 503 });

  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { slug?: unknown } | null;
  const slug = typeof body?.slug === 'string' ? body.slug.trim() : '';
  if (!slug) return NextResponse.json({ error: 'Falta el estudio' }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return errorInterno('public/wallet-pase', new Error('sin service-role'), 'No hemos podido preparar tu pase.');

  try {
    const estudio = await cargarEstudio(slug);
    if (!estudio || estudio === 'no-disponible') return NextResponse.json({ error: 'Estudio no encontrado' }, { status: 404 });
    // Sin control de acceso con QR no hay nada que llevar en el pase.
    if (estudio.qrAcceso !== true) return NextResponse.json({ error: 'Tu estudio no usa el acceso con QR.' }, { status: 409 });

    const socioId = await socioAutenticado(user.userId, estudio.id);
    if (!socioId) return NextResponse.json({ error: 'No eres clienta de este estudio' }, { status: 403 });

    const [{ token }, { data: socia }] = await Promise.all([
      qrDeLaAlumna(admin, { studioId: estudio.id, socioId }),
      admin.from('socios').select('nombre').eq('id', socioId).eq('studio_id', estudio.id).maybeSingle(),
    ]);

    // Los iconos del ESTUDIO, los mismos PNG que su app (`urlIconoEstudio`).
    const imagenes = { iconoUrl: estudio.iconoMarcaUrl, logoUrl: estudio.logoUrl };
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? null;
    const traer = async (size: 64 | 180) => {
      const r = await fetch(new URL(urlIconoEstudio(estudio.nombre, estudio.colorPrimario, size, imagenes, base), appUrl()));
      if (!r.ok) throw new Error(`icono ${size}: ${r.status}`);
      return Buffer.from(await r.arrayBuffer());
    };
    const [icono, icono2x] = await Promise.all([traer(64), traer(180)]);

    const pkpass = await firmarPase(config, {
      serial: `${estudio.id}:${socioId}`,
      estudio: { nombre: estudio.nombre, colorPrimario: estudio.colorPrimario, direccion: estudio.direccion || null, apariencia: estudio.apariencia },
      alumna: { nombre: (socia?.nombre as string | null) ?? '' },
      qr: token,
    }, { icono, icono2x });

    return new NextResponse(new Uint8Array(pkpass), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.apple.pkpass',
        'Content-Disposition': 'attachment; filename="acceso.pkpass"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return errorInterno('public/wallet-pase:POST', err, 'No hemos podido preparar tu pase.');
  }
}
