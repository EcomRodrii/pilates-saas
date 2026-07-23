import { getStudioSeo } from '@/lib/studio-seo';

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
      icons: [
        // El logo del estudio primero (si lo tiene); los iconos 192/512 de la
        // plataforma se mantienen como fallback para cumplir los requisitos de
        // instalación de PWA (tamaños declarados conocidos).
        ...(studio?.logoUrl ? [{ src: studio.logoUrl, sizes: 'any' }] : []),
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
    },
    { headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'public, max-age=3600' } },
  );
}
