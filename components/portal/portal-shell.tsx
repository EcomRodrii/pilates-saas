'use client';

// Reemplazo drop-in de components/portal/portal-shell.tsx
// Mantiene toda la lógica de auth/redirección original; solo cambia el aspecto
// (fondo por tema, tab bar rediseñada estilo "Impulso").

import { useEffect } from 'react';
import { usePathname, useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Home, Calendar, CreditCard, Play, TrendingUp } from 'lucide-react';
import { usePortalAuth } from '@/lib/portal-auth';
import { useStudio } from '@/lib/studio-context';
import { portalThemeStyle } from '@/lib/portal-theme';
import { useModo } from '@/lib/portal-modo';

const NAV = [
  { seg: 'clases', icon: Calendar, label: 'Clases' },
  { seg: 'home', icon: Home, label: 'Inicio' },
  { seg: 'mi-plan', icon: CreditCard, label: 'Mi plan' },
  { seg: 'videos', icon: Play, label: 'Vídeos' },
  { seg: 'progreso', icon: TrendingUp, label: 'Progreso' },
];

export function PortalShell({ children }: { children: React.ReactNode }) {
  const { session, isLoading } = usePortalAuth();
  const { studio } = useStudio();
  const pathname = usePathname();
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const themeStyle = portalThemeStyle(studio?.temaPortal);
  const { noche, t } = useModo();

  const isLoginPage = pathname === `/portal/${slug}` || pathname === `/portal/${slug}/login` || pathname === `/portal/${slug}/acceso`;
  // /clave-nueva llega recién autenticada por magic link (o sin sesión válida
  // si el enlace caducó / el email no es de este centro): gestiona sus propios
  // estados (verificando / error / formulario) — el shell no debe redirigirla
  // ni bloquearla con el spinner genérico.
  const isClaveNueva = pathname === `/portal/${slug}/clave-nueva`;

  useEffect(() => {
    if (isLoading || isClaveNueva) return;
    if (!session && !isLoginPage) router.replace(`/portal/${slug}/login`);
    if (session && isLoginPage) router.replace(`/portal/${slug}/clases`);
  }, [session, isLoading, isLoginPage, isClaveNueva, router, slug]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isClaveNueva) return <div style={themeStyle}>{children}</div>;

  if (isLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: t.bg }}>
        <div className="w-8 h-8 rounded-full animate-spin" style={{ border: `3px solid ${t.line}`, borderTopColor: t.ink }} />
      </div>
    );
  }

  if (!session && !isLoginPage) return null;
  if (session && isLoginPage) return null;
  if (isLoginPage) return <div style={themeStyle}>{children}</div>;

  return (
    <div
      className="fixed inset-0 flex flex-col overflow-hidden"
      style={{ paddingTop: 'env(safe-area-inset-top)', background: t.bg, fontFamily: "'Plus Jakarta Sans', sans-serif", ...themeStyle }}
    >
      <main className="flex-1 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
        {children}
        <div style={{ height: 'calc(80px + env(safe-area-inset-bottom))' }} />
      </main>

      <nav
        className="absolute bottom-0 inset-x-0"
        style={{
          background: t.tabbar,
          borderTop: `1px solid ${t.line}`,
          backdropFilter: 'blur(20px)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <div className="flex h-[62px] px-1.5">
          {NAV.map(({ seg, icon: Icon, label }) => {
            const href = `/portal/${slug}/${seg}`;
            const active = pathname.startsWith(href);
            const activeColor = noche ? 'var(--portal-brand)' : t.ink;
            return (
              <Link
                key={seg}
                href={href}
                className="flex-1 flex flex-col items-center justify-center gap-[4px] active:opacity-70 transition-opacity"
              >
                <Icon size={22} strokeWidth={active ? 2.4 : 1.9} style={{ color: active ? activeColor : t.muted }} />
                <span className="text-[9.5px] tracking-wide" style={{ color: active ? activeColor : t.muted, fontWeight: active ? 800 : 700 }}>
                  {label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
