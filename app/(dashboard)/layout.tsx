'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { useAuth } from '@/lib/auth-context';
import { usePermisos } from '@/lib/permisos';
import { PanelThemeProvider } from '@/lib/panel-theme';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const { puedeVer } = usePermisos();
  const router = useRouter();
  const pathname = usePathname();

  // NOTE: Auth gate temporarily disabled again (petición explícita del usuario para probar sin login)
  // useEffect(() => {
  //   if (!loading && !session) router.replace('/login');
  // }, [loading, session, router]);

  const autorizado = puedeVer(pathname);
  useEffect(() => {
    if (!loading && session && !autorizado) router.replace('/dashboard');
  }, [loading, session, autorizado, router]);

  if (loading) return null;

  if (!autorizado) {
    return (
      <PanelThemeProvider className="min-h-screen bg-background">
        <Sidebar />
        <main className="lg:pl-[var(--sidebar-w)] min-h-screen transition-[padding] duration-200" />
      </PanelThemeProvider>
    );
  }

  return (
    <PanelThemeProvider className="min-h-screen bg-background">
      <Sidebar />
      <main className="lg:pl-[var(--sidebar-w)] min-h-screen transition-[padding] duration-200">
        <div className="pt-14 lg:pt-2 pb-20 lg:pb-0 max-w-[1320px] mx-auto px-4 lg:px-6 py-6 lg:py-6">
          <Topbar />
          {children}
        </div>
      </main>
    </PanelThemeProvider>
  );
}
