'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Home, Calendar, CreditCard, Play, TrendingUp } from 'lucide-react';
import { usePortalAuth } from '@/lib/portal-auth';

const NAV = [
  { href: '/portal/home', icon: Home, label: 'Inicio' },
  { href: '/portal/clases', icon: Calendar, label: 'Clases' },
  { href: '/portal/mi-plan', icon: CreditCard, label: 'Mi plan' },
  { href: '/portal/videos', icon: Play, label: 'Videos' },
  { href: '/portal/progreso', icon: TrendingUp, label: 'Progreso' },
];

export function PortalShell({ children }: { children: React.ReactNode }) {
  const { session, isLoading } = usePortalAuth();
  const pathname = usePathname();
  const router = useRouter();

  const isLoginPage = pathname === '/portal' || pathname === '/portal/login';

  useEffect(() => {
    if (isLoading) return;
    if (!session && !isLoginPage) router.replace('/portal/login');
    if (session && isLoginPage) router.replace('/portal/home');
  }, [session, isLoading, isLoginPage, router]);

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-white flex items-center justify-center">
        <div className="w-8 h-8 border-[3px] border-[#C08497]/20 border-t-[#C08497] rounded-full animate-spin" />
      </div>
    );
  }

  if (!session && !isLoginPage) return null;
  if (session && isLoginPage) return null;
  if (isLoginPage) return <>{children}</>;

  return (
    <div
      className="fixed inset-0 flex flex-col bg-white overflow-hidden"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      {/* Scrollable content */}
      <main
        className="flex-1 overflow-y-auto"
        style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
      >
        {children}
        <div style={{ height: 'calc(72px + env(safe-area-inset-bottom))' }} />
      </main>

      {/* Tab bar */}
      <nav
        className="absolute bottom-0 inset-x-0 bg-white/95 border-t border-black/[0.06]"
        style={{
          backdropFilter: 'blur(20px)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <div className="flex h-[56px]">
          {NAV.map(({ href, icon: Icon, label }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className="flex-1 flex flex-col items-center justify-center gap-[2px]"
              >
                <Icon
                  size={22}
                  strokeWidth={active ? 2.5 : 1.8}
                  className={active ? 'text-[#C08497]' : 'text-[#C9BCC0]'}
                />
                <span
                  className="text-[9px] font-semibold tracking-wide"
                  style={{ color: active ? '#C08497' : '#C9BCC0' }}
                >
                  {label.toUpperCase()}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
