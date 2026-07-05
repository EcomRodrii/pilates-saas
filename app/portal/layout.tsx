import { PortalAuthProvider } from '@/lib/portal-auth';
import { PortalShell } from '@/components/portal/portal-shell';

export const metadata = {
  title: 'Mi Estudio · Portal',
  description: 'Tu espacio de miembro',
  manifest: '/manifest.json',
  themeColor: '#4F46E5',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Mi Estudio',
  },
};

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalAuthProvider>
      <PortalShell>{children}</PortalShell>
    </PortalAuthProvider>
  );
}
