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
  const { session, isLoading, logout } = usePortalAuth();
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
        <div className="w-7 h-7 border-2 border-[#4F46E5]/20 border-t-[#4F46E5] rounded-full animate-spin" />
      </div>
    );
  }

  if (!session && !isLoginPage) return null;
  if (session && isLoginPage) return null;

  if (isLoginPage) return <>{children}</>;

  return (
    /* Root: fixed, full screen, no scroll on body */
    <div
      className="fixed inset-0 flex flex-col bg-[#F2F2F7] overflow-hidden"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      {/* Scrollable content */}
      <main className="flex-1 overflow-y-auto overscroll-y-contain" style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
        {children}
        {/* spacer so content isn't hidden behind nav */}
        <div style={{ height: 'calc(68px + env(safe-area-inset-bottom))' }} />
      </main>

      {/* Bottom tab bar */}
      <nav
        className="absolute bottom-0 inset-x-0 bg-white/90 backdrop-blur-xl border-t border-black/[0.08]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex h-[50px]">
          {NAV.map(item => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex-1 flex flex-col items-center justify-center gap-[3px] select-none"
              >
                <div className={`w-[34px] h-[22px] rounded-full flex items-center justify-center transition-colors ${active ? 'bg-[#4F46E5]/10' : ''}`}>
                  <item.icon
                    size={19}
                    strokeWidth={active ? 2.5 : 1.8}
                    className={active ? 'text-[#4F46E5]' : 'text-[#8E8E93]'}
                  />
                </div>
                <span className={`text-[9.5px] font-medium leading-none ${active ? 'text-[#4F46E5] font-semibold' : 'text-[#8E8E93]'}`}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
