import { NextRequest, NextResponse } from 'next/server';
import { LEGAL } from '@/lib/legal-info';
import { pngQr } from '@/lib/qr/png';

// El QR de la página de reservas de un estudio, en PNG: lo lleva el correo «Ya
// puedes recibir reservas» del alta nueva (PR-4), y Gmail no pinta un SVG.
//
// Público y sin sesión: el slug ya es público (es la dirección de su página) y
// la imagen no lleva ningún dato de nadie, solo esa dirección. Por eso tampoco
// se mira la base de datos: el QR de un slug que no existe abre una página que
// dice que no existe, que es lo mismo que teclearla.
//
// La dirección es la misma que el enlace del correo (`NEXT_PUBLIC_APP_URL`, o la
// de Tentare). El mismo slug da siempre el mismo PNG: caché larga.

export const runtime = 'nodejs';

const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!SLUG.test(slug)) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  const base = (process.env.NEXT_PUBLIC_APP_URL || LEGAL.url).replace(/\/+$/, '');
  const png = pngQr(`${base}/reservar/${slug}`);
  return new NextResponse(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Content-Length': String(png.length),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
