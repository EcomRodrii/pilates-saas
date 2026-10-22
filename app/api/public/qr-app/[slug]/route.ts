import { NextRequest, NextResponse } from 'next/server';
import { LEGAL } from '@/lib/legal-info';
import { pngQr } from '@/lib/qr/png';
import { SLUG_PARA_QR, rutaApp, urlAbsoluta } from '@/lib/enlaces-estudio';

// El QR de la APP de las alumnas de un estudio, en PNG: lo lleva el correo «Ya
// puedes recibir reservas» del alta nueva, y Gmail no pinta un SVG.
//
// Es el hermano de `/api/public/qr-reservas/<slug>` (que codifica la página de
// reservas, `/reservar/<slug>`, y se queda tal cual: hay correos ya enviados con
// esa imagen y el CDN la tiene cacheada para siempre). Desde el 22-oct-2026 lo
// que Tentare le da a un estudio para pasar a sus alumnas es la app
// (`/portal/<slug>`), no la página de reservas, que es para integrar en su web
// (lib/enlaces-estudio.ts). Por eso esta ruta nueva en vez de cambiar la otra.
//
// Público y sin sesión: el slug ya es público (es la dirección de su app) y la
// imagen no lleva ningún dato de nadie, solo esa dirección. Por eso tampoco se
// mira la base de datos: el QR de un slug que no existe abre una página que dice
// que no existe, que es lo mismo que teclearla.
//
// La dirección es la misma que el enlace del correo (`NEXT_PUBLIC_APP_URL`, o la
// de Tentare). El mismo slug da siempre el mismo PNG: caché larga.

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!SLUG_PARA_QR.test(slug)) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  const base = process.env.NEXT_PUBLIC_APP_URL || LEGAL.url;
  const png = pngQr(urlAbsoluta(base, rutaApp(slug)));
  return new NextResponse(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Content-Length': String(png.length),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
