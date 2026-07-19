import type { Viewport } from 'next';
import { PortalAuthProvider } from '@/lib/portal-auth';
import { PortalShell } from '@/components/portal/portal-shell';
import { StudioSlugGate } from '@/components/studio-slug-gate';
import { ThemeStyle } from '@/components/theme-style';
import { getStudioSeo } from '@/lib/studio-seo';

export const metadata = {
  title: 'Mi Estudio · Portal',
  description: 'Tu espacio de miembro',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Mi Estudio',
  },
};

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
