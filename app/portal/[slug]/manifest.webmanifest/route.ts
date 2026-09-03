import { NextResponse } from 'next/server';
import { cargarEstudio } from '@/lib/student/estudio';
import { urlMonograma } from '@/lib/monograma-estudio';

// Manifest POR ESTUDIO. Es lo que convierte «añadir a pantalla de inicio» en la
// app del estudio y no en «Tentare»: nombre, icono y `start_url` propios.
//
// Antes esto existía como `app/portal/[slug]/manifest.webmanifest` y se fue con
// el borrado del portal; los tres manifests que quedaron (plataforma, panel y
// Network) son de otros productos. Mismo patrón que `app/panel.webmanifest`.
//
// `scope` y `start_url` apuntan al prefijo del estudio: sin eso, abrir la app
// instalada llevaría a la raíz de la plataforma.
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const estudio = await cargarEstudio(slug);
  if (!estudio) return new NextResponse('No encontrado', { status: 404 });

  const base = `/portal/${encodeURIComponent(slug)}`;
  return NextResponse.json(
    {
      name: estudio.nombre,
      short_name: estudio.nombre,
      description: `Reserva, bono y acceso a ${estudio.nombre}.`,
      start_url: base,
      scope: base,
      display: 'standalone',
      background_color: '#FAF9F5',
      theme_color: '#FAF9F5',
      lang: 'es',
      icons: [
        { src: urlMonograma(estudio.nombre, estudio.colorPrimario, 192), sizes: '192x192', type: 'image/png' },
        { src: urlMonograma(estudio.nombre, estudio.colorPrimario, 512), sizes: '512x512', type: 'image/png' },
        { src: urlMonograma(estudio.nombre, estudio.colorPrimario, 512), sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    {
      headers: {
        'Content-Type': 'application/manifest+json',
        // El manifest cambia si la propietaria renombra el estudio o cambia su
        // color; una hora de caché con revalidación es suficiente.
        'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
      },
    },
  );
}
