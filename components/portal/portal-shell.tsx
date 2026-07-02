'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Home, Calendar, CreditCard, Play, BarChart2 } from 'lucide-react';
import { usePortalAuth } from '@/lib/portal-auth';
import { useStudio } from '@/lib/studio-context';

const NAV = [
  { href: '/portal/home', icon: Home, label: 'Inicio' },
  { href: '/portal/clases', icon: Calendar, label: 'Clases' },
  { href: '/portal/mi-plan', icon: CreditCard, label: 'Mi plan' },
  { href: '/portal/videos', icon: Play, label: 'Videos' },
  { href: '/portal/progreso', icon: BarChart2, label: 'Progreso' },
];

export function PortalShell({ children }: { children: React.ReactNode }) {
  const { session, isLoading, logout } = usePortalAuth();
  const { studioConfig } = useStudio();
  const pathname = usePathname();
  const router = useRouter();

  const isLoginPage = pathname === '/portal' || pathname === '/portal/login';

  useEffect(() => {
    if (isLoading) return;
    if (!session && !isLoginPage) {
      router.replace('/portal/login');
    }
    if (session && isLoginPage) {
      router.replace('/portal/home');
    }
  }, [session, isLoading, isLoginPage, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#4F46E5] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session && !isLoginPage) return null;
  if (session && isLoginPage) return null;

  if (isLoginPage) {
    return <div className="min-h-screen bg-[#F8F9FA]">{children}</div>;
  }

  const initials = session!.nombre
    .split(' ')
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase();

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col">
      {/* Top bar */}
      <header className="fixed top-0 inset-x-0 z-40 h-14 bg-white border-b border-[#E8EAED] flex items-center px-4 gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-[#9CA3AF] leading-none">Tu estudio</p>
          <p className="text-sm font-bold text-[#111827] truncate">Pilates Studio</p>
        </div>
        <button
          onClick={logout}
          className="w-9 h-9 rounded-full bg-[#4F46E5] flex items-center justify-center text-white text-xs font-bold shrink-0"
          title="Cerrar sesión"
        >
          {initials}
        </button>
      </header>

      {/* Content */}
      <main className="flex-1 pt-14 pb-20 max-w-lg mx-auto w-full">
        {children}
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-[#E8EAED]">
        <div className="max-w-lg mx-auto flex">
          {NAV.map(item => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex-1 flex flex-col items-center gap-0.5 py-2.5 transition-colors"
              >
                <item.icon
                  size={20}
                  style={{ color: active ? '#4F46E5' : '#9CA3AF' }}
                  strokeWidth={active ? 2.5 : 1.8}
                />
                <span
                  className="text-[10px] font-semibold"
                  style={{ color: active ? '#4F46E5' : '#9CA3AF' }}
                >
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
