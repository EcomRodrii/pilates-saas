'use client';

// Reemplazo drop-in de components/portal/portal-shell.tsx
// Mantiene toda la lógica de auth/redirección original; solo cambia el aspecto
// (fondo por tema, tab bar flotante con animación "gooey" estilo burbuja líquida).

import { useEffect } from 'react';
import { usePathname, useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Home, Calendar, CreditCard, Play, TrendingUp } from 'lucide-react';
import { usePortalAuth } from '@/lib/portal-auth';
import { useStudio } from '@/lib/studio-context';
import { portalThemeStyle } from '@/lib/portal-theme';
import { useModo } from '@/lib/portal-modo';
import { MARKETING_MODULE_ENABLED } from '@/lib/feature-flags';

const ALL_NAV = [
  { seg: 'clases', icon: Calendar, label: 'Clases' },
  { seg: 'home', icon: Home, label: 'Inicio' },
  { seg: 'mi-plan', icon: CreditCard, label: 'Mi plan' },
  { seg: 'videos', icon: Play, label: 'Vídeos' },
  { seg: 'progreso', icon: TrendingUp, label: 'Progreso' },
];

// Oferta digital oculta temporalmente (ver lib/feature-flags.ts): sin "Vídeos".
const NAV = MARKETING_MODULE_ENABLED ? ALL_NAV : ALL_NAV.filter((n) => n.seg !== 'videos');

const SLOT = 100 / NAV.length;

export function PortalShell({ children }: { children: React.ReactNode }) {
  const { session, isLoading } = usePortalAuth();
  const { studio } = useStudio();
  const pathname = usePathname();
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const themeStyle = portalThemeStyle(studio?.temaPortal);
  const { t } = useModo();

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

  // El portal es una app de móvil, no un sitio responsive: en pantallas anchas
  // (alguien lo abre en el navegador del ordenador) FRAME la limita al ancho de
  // un teléfono y la centra, en vez de estirarla borde a borde — así se evita
  // el aspecto roto/desproporcionado que da un diseño móvil sin tope de ancho.
  const FRAME: React.CSSProperties = { maxWidth: 480, width: '100%', height: '100%', margin: '0 auto', position: 'relative', overflow: 'hidden' };

  if (isClaveNueva) {
    return (
      <div className="fixed inset-0" style={{ background: t.bg }}>
        <div style={{ ...FRAME, ...themeStyle }}>{children}</div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: t.bg }}>
        <div className="w-8 h-8 rounded-full animate-spin" style={{ border: `3px solid ${t.line}`, borderTopColor: t.ink }} />
      </div>
    );
  }

  if (!session && !isLoginPage) return null;
  if (session && isLoginPage) return null;
  if (isLoginPage) {
    return (
      <div className="fixed inset-0" style={{ background: t.bg }}>
        <div style={{ ...FRAME, ...themeStyle }}>{children}</div>
      </div>
    );
  }

  const activeIndex = NAV.findIndex(({ seg }) => pathname.startsWith(`/portal/${slug}/${seg}`));
  const blobLeft = (i: number) => `calc(${(i + 0.5) * SLOT}% - 23px)`;

  return (
    <div className="fixed inset-0" style={{ background: t.bg }}>
      <div
        className="flex flex-col overflow-hidden"
        style={{ ...FRAME, paddingTop: 'env(safe-area-inset-top)', background: t.bg, fontFamily: "'Plus Jakarta Sans', sans-serif", ...themeStyle }}
      >
        <main className="flex-1 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
          {children}
          <div style={{ height: 'calc(96px + env(safe-area-inset-bottom))' }} />
        </main>

        {/* Filtro SVG "gooey": funde dos círculos superpuestos en una gota líquida.
            Sin esto las dos burbujas del blob solo se verían como dos círculos
            separados en vez de un chicle estirándose entre pestañas. */}
        <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
          <defs>
            <filter id="portal-tab-goo">
              <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur" />
              <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 24 -10" result="goo" />
              <feBlend in="SourceGraphic" in2="goo" />
            </filter>
          </defs>
        </svg>

        <nav
          className="absolute left-1/2"
          style={{
            bottom: 'calc(18px + env(safe-area-inset-bottom))',
            transform: 'translateX(-50%)',
            width: 'min(340px, calc(100% - 48px))',
            height: 60,
            borderRadius: 999,
            background: t.tabbar,
            border: `1px solid ${t.line}`,
            backdropFilter: 'blur(20px)',
            boxShadow: '0 8px 28px rgba(0,0,0,0.22)',
          }}
        >
          {/* Capa del blob líquido: dos burbujas con distinta duración de
              transición (la de detrás va más lenta) para que se estiren entre
              posiciones antes de fundirse de nuevo en un círculo. */}
          {activeIndex >= 0 && (
            <div className="absolute inset-0" style={{ filter: 'url(#portal-tab-goo)', pointerEvents: 'none' }}>
              <div
                className="absolute top-1/2"
                style={{
                  left: blobLeft(activeIndex), width: 46, height: 46, borderRadius: 999,
                  background: 'var(--portal-brand)', transform: 'translateY(-50%)',
                  transition: 'left 340ms cubic-bezier(0.22, 1, 0.36, 1)',
                }}
              />
              <div
                className="absolute top-1/2"
                style={{
                  left: blobLeft(activeIndex), width: 46, height: 46, borderRadius: 999,
                  background: 'var(--portal-brand)', transform: 'translateY(-50%)',
                  transition: 'left 190ms cubic-bezier(0.22, 1, 0.36, 1)',
                }}
              />
            </div>
          )}

          <div className="relative flex h-full">
            {NAV.map(({ seg, icon: Icon, label }, i) => {
              const href = `/portal/${slug}/${seg}`;
              const active = i === activeIndex;
              return (
                <Link
                  key={seg}
                  href={href}
                  aria-label={label}
                  className="flex-1 flex items-center justify-center active:opacity-70"
                >
                  <Icon
                    size={21}
                    strokeWidth={active ? 2.4 : 1.9}
                    style={{ color: active ? t.accentInk : t.muted, transition: 'color 160ms ease 60ms' }}
                  />
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
