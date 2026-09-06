import { NextResponse } from 'next/server';
import { cargarEstudio } from '@/lib/student/estudio';
import { urlIconoEstudio } from '@/lib/monograma-estudio';

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
  // 503 y no 404 cuando el fallo es de lectura: un 404 aquí hace que el
  // navegador CACHEE la ausencia de manifest y el estudio deje de ser
  // instalable hasta que se limpie la caché.
  if (estudio === 'no-disponible') {
    return new NextResponse('No disponible', { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  if (!estudio) return new NextResponse('No encontrado', { status: 404 });

  const base = `/portal/${encodeURIComponent(slug)}`;
  // Solo se acepta un logo alojado en NUESTRO Supabase: la ruta del icono lo
  // descarga en servidor, así que una URL libre sería una puerta de SSRF.
  const icono = (size: 192 | 512) =>
    urlIconoEstudio(estudio.nombre, estudio.colorPrimario, size, estudio.logoUrl, process.env.NEXT_PUBLIC_SUPABASE_URL ?? null);
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
      // Con el LOGO del estudio cuando lo tiene y podemos servirlo; si no, su
      // inicial. Ver el comentario del layout: `urlIconoEstudio` llevaba tiempo
      // escrita y probada, y aquí se seguía llamando a `urlMonograma`, que no
      // sabe de logos.
      icons: [
        { src: icono(192), sizes: '192x192', type: 'image/png' },
        { src: icono(512), sizes: '512x512', type: 'image/png' },
        { src: icono(512), sizes: '512x512', type: 'image/png', purpose: 'maskable' },
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
