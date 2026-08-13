import { getStudioSeo } from '@/lib/studio-seo';
import { urlMonograma } from '@/lib/monograma-estudio';

// Manifest PWA POR ESTUDIO: la "app de marca" instalada debe llamarse como el
// estudio y llevar su color y su logo — no "Mi Estudio Pilates" con el tema de
// la plataforma (el manifest raíz app/manifest.ts, que ahora es el de Tentare,
// solo aplica fuera del portal). El layout del portal lo referencia vía
// generateMetadata, con scope y start_url anclados al slug para que cada
// estudio instale SU app.
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const studio = await getStudioSeo(slug);
  const nombre = studio?.nombre ?? 'Mi estudio';

  return Response.json(
    {
      name: nombre,
      short_name: nombre.length > 14 ? `${nombre.slice(0, 13).trimEnd()}…` : nombre,
      description: `Portal de miembros de ${nombre}`,
      start_url: `/portal/${slug}`,
      scope: `/portal/${slug}`,
      display: 'standalone',
      background_color: '#F8F9FA',
      theme_color: studio?.colorPrimario ?? '#131313',
      orientation: 'portrait',
      icons: studio?.logoUrl
        ? [
            { src: studio.logoUrl, sizes: 'any' },
            // El logo cubre el requisito de instalación por sí solo, pero se
            // añaden igual los dos tamaños declarados por si el logo no es
            // cuadrado — algunos instaladores de Android lo descartan sin un
            // 192/512 exacto entre las opciones.
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          ]
        : [
            // Sin logo, antes esto caía al icono de TENTARE — la app
            // instalada de un estudio de Pilates llevaba la marca de otro
            // negocio en la pantalla de inicio de su alumna. La inicial de su
            // nombre sobre su propio color de marca es su icono, no un
            // préstamo.
            // `nombre` (ya con el fallback 'Mi estudio' aplicado) y no
            // `studio?.nombre`: sin esto, un estudio no encontrado enseñaba
            // «Mi estudio» como nombre de la app y un «?» como icono —
            // inconsistentes entre sí porque cada uno leía una fuente distinta.
            { src: urlMonograma(nombre, studio?.colorPrimario, 192), sizes: '192x192', type: 'image/png' },
            { src: urlMonograma(nombre, studio?.colorPrimario, 512), sizes: '512x512', type: 'image/png' },
          ],
    },
    { headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'public, max-age=3600' } },
  );
}
