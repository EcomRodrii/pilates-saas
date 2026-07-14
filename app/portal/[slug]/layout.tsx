import { PortalAuthProvider } from '@/lib/portal-auth';
import { PortalShell } from '@/components/portal/portal-shell';
import { StudioSlugGate } from '@/components/studio-slug-gate';
import { ThemeStyle } from '@/components/theme-style';

export const metadata = {
  title: 'Mi Estudio · Portal',
  description: 'Tu espacio de miembro',
  manifest: '/manifest.json',
  themeColor: '#131313',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Mi Estudio',
  },
};

export default async function PortalLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <StudioSlugGate slug={slug}>
      <ThemeStyle slug={slug} />
      <PortalAuthProvider slug={slug}>
        <PortalShell>{children}</PortalShell>
      </PortalAuthProvider>
    </StudioSlugGate>
  );
}
