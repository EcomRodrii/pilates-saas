import { getStudioSeo } from '@/lib/studio-seo';
import { urlIconoEstudio } from '@/lib/monograma-estudio';

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
      // ⚠️ Aquí NO puede aparecer ningún icono de Tentare, ni como respaldo.
      //
      // Antes, teniendo logo, esta lista añadía `/icon-192.png` y
      // `/icon-512.png` —los de Tentare— «por si el logo no es cuadrado». Y ahí
      // estaba el fallo que reportó una propietaria con su logo ya subido: un
      // instalador de Android que exige un 192/512 exacto DESCARTA el logo
      // (declarado `sizes: 'any'`) y se queda con el único candidato de ese
      // tamaño, que era la marca de otra empresa. La alumna acababa con el
      // icono de Tentare en su pantalla de inicio.
      //
      // Los tamaños exactos siguen haciendo falta; lo que cambia es que ahora
      // son SUYOS: `/icono-estudio` compone su logo sobre su color de marca en
      // un lienzo cuadrado, y sin logo cae a la inicial. Nunca a Tentare.
      //
      // `nombre` (ya con el fallback 'Mi estudio' aplicado) y no
      // `studio?.nombre`: sin esto, un estudio no encontrado enseñaba «Mi
      // estudio» como nombre de la app y un «?» como icono — inconsistentes
      // entre sí porque cada uno leía una fuente distinta.
      icons: [
        ...(studio?.logoUrl ? [{ src: studio.logoUrl, sizes: 'any' }] : []),
        { src: urlIconoEstudio(nombre, studio?.colorPrimario, 192, studio?.logoUrl, process.env.NEXT_PUBLIC_SUPABASE_URL), sizes: '192x192', type: 'image/png' },
        { src: urlIconoEstudio(nombre, studio?.colorPrimario, 512, studio?.logoUrl, process.env.NEXT_PUBLIC_SUPABASE_URL), sizes: '512x512', type: 'image/png' },
      ],
    },
    { headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'public, max-age=3600' } },
  );
}
