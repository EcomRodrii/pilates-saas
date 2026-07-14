'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { useAuth } from '@/lib/auth-context';
import { useStudio } from '@/lib/studio-context';
import { usePermisos } from '@/lib/permisos';
import { PanelThemeProvider } from '@/lib/panel-theme';
import { estadoBilling } from '@/lib/api-client';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const { studio } = useStudio();
  const { puedeVer } = usePermisos();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !session) router.replace('/login');
  }, [loading, session, router]);

  // Gate de suscripción. `estadoBilling` es fail-open: solo devuelve bloqueado=true
  // cuando BILLING_ENFORCED=true Y Stripe está configurado Y no hay suscripción
  // activa. Con la enforcement apagada (por defecto) nunca redirige.
  useEffect(() => {
    if (loading || !session) return;
    let vivo = true;
    estadoBilling().then((e) => {
      if (vivo && e?.bloqueado) router.replace('/suscripcion');
    });
    return () => { vivo = false; };
  }, [loading, session, router]);

  // El rol solo está resuelto cuando el ESTUDIO del usuario ya cargó. Ojo: no
  // vale `dataLoaded`, porque el provider hace un primer fetch con la sesión aún
  // sin resolver (authUserId nulo) que deja `studio` a null pero `dataLoaded` a
  // true; decidir ahí veía el rol mínimo (fail-closed de A-2) y rebotaba a
  // /dashboard al REFRESCAR una página solo-PROPIETARIO. Con `studio !== null`
  // esperamos a que useRol tenga el dato del dueño. El servidor ya protege cada
  // endpoint, así que renderizar el marco mientras carga no expone datos.
  const rolResuelto = studio !== null;
  const autorizado = puedeVer(pathname);
  useEffect(() => {
    if (!loading && session && rolResuelto && !autorizado) router.replace('/dashboard');
  }, [loading, session, rolResuelto, autorizado, router]);

  if (loading) return null;

  if (rolResuelto && !autorizado) {
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
      <main className="lg:pl-[var(--sidebar-w)] lg:pt-[var(--topnav-h)] min-h-screen transition-[padding] duration-200">
        <div className="pt-14 lg:pt-2 pb-20 lg:pb-0 max-w-[1320px] mx-auto px-4 lg:px-6 py-6 lg:py-6">
          <Topbar />
          {children}
        </div>
      </main>
    </PanelThemeProvider>
  );
}
