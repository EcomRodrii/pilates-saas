import type { Viewport } from 'next';
import { PortalAuthProvider } from '@/lib/portal-auth';
import { PortalShell } from '@/components/portal/portal-shell';
import { StudioSlugGate } from '@/components/studio-slug-gate';
import { ThemeStyle } from '@/components/theme-style';
import { getStudioSeo } from '@/lib/studio-seo';

// Metadata dinámica: el portal es la "app de marca" del estudio, así que el
// título, el nombre de la app instalada (appleWebApp.title) y el manifest son
// los del estudio, no genéricos. getStudioSeo está cacheada por request, así
// que esta consulta se comparte con la del layout. (Antes además se apuntaba a
// /manifest.json, que no existe — Next sirve /manifest.webmanifest.)
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const studio = await getStudioSeo(slug);
  const nombre = studio?.nombre ?? 'Mi Estudio';
  return {
    title: `${nombre} · Portal`,
    description: 'Tu espacio de miembro',
    manifest: `/portal/${slug}/manifest.webmanifest`,
    appleWebApp: {
      capable: true,
      statusBarStyle: 'default' as const,
      title: nombre,
    },
  };
}

// `viewportFit: 'cover'` es lo que hace que `env(safe-area-inset-*)` (usado en
// portal-shell.tsx y en los bottom sheets) devuelva algo distinto de 0 en un
// iPhone con notch/Dynamic Island — sin esto, todo ese código es inerte y el
// contenido puede quedar comprimido contra el borde real de la pantalla.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#131313',
};

export default async function PortalLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // Resolvemos el estudio en el SERVIDOR (misma consulta cacheada por request
  // que usa ThemeStyle): el gate monta el StudioProvider al instante, sin el
  // round-trip de cliente a resolveStudioIdBySlug que hacía antes (mismo
  // patrón ya usado en app/reservar/[slug]/layout.tsx).
  const studio = await getStudioSeo(slug);
  return (
    <StudioSlugGate slug={slug} initialStudioId={studio?.id ?? null} initialResuelto>
      <ThemeStyle slug={slug} />
      <PortalAuthProvider slug={slug}>
        <PortalShell>{children}</PortalShell>
      </PortalAuthProvider>
    </StudioSlugGate>
  );
}
