'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Calendar, Users, CreditCard,
  FileText, Settings, BarChart2, ChevronRight, X,
  Clock, ShoppingCart, MessageCircle, Megaphone, Play, Bell,
  Menu, Bot, ArrowLeftRight, Package, Store, Inbox, ExternalLink,
  LogOut, UserCog,
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { GlobalSearch } from '@/components/search/global-search';
import { useAuth } from '@/lib/auth-context';

// ─── Nav config ──────────────────────────────────────────────────────────────

const navSections = [
  { items: [{ href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }] },
  { items: [{ href: '/automatizaciones', label: 'Automatizaciones IA', icon: Bot }] },
  {
    label: 'Clases',
    items: [
      { href: '/calendario', label: 'Calendario', icon: Calendar },
      { href: '/citas', label: 'Citas', icon: Clock },
    ],
  },
  {
    label: 'Miembros',
    items: [
      { href: '/socios', label: 'Miembros', icon: Users },
      { href: '/mensajeria', label: 'Mensajería', icon: Inbox },
      { href: '/comunidad', label: 'Comunidad', icon: MessageCircle },
    ],
  },
  {
    label: 'Ventas',
    items: [
      { href: '/transacciones', label: 'Transacciones', icon: ArrowLeftRight },
      { href: '/facturas', label: 'Facturas', icon: FileText },
      { href: '/productos', label: 'Productos', icon: Package },
      { href: '/pos', label: 'POS', icon: Store },
    ],
  },
  {
    label: 'Estudio',
    items: [
      { href: '/equipo', label: 'Equipo', icon: UserCog },
      { href: '/marketing', label: 'Marketing', icon: Megaphone },
      { href: '/ondemand', label: 'Oferta digital', icon: Play },
      { href: '/informes', label: 'Informes', icon: BarChart2 },
      { href: '/configuracion', label: 'Mi estudio', icon: Settings },
    ],
  },
];

// Bottom nav shows 4 main items + "Más"
const bottomNavItems = [
  { href: '/dashboard', label: 'Inicio', icon: LayoutDashboard },
  { href: '/calendario', label: 'Clases', icon: Calendar },
  { href: '/socios', label: 'Miembros', icon: Users },
  { href: '/transacciones', label: 'Ventas', icon: ArrowLeftRight },
];

// ─── Desktop nav item ─────────────────────────────────────────────────────────

function NavItem({ href, label, Icon, onClick }: { href: string; label: string; Icon: React.ElementType; onClick?: () => void }) {
  const pathname = usePathname();
  const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        'flex items-center gap-2.5 px-3 py-2 rounded-full text-[13px] font-medium transition-all relative',
        active ? 'bg-[#C6F53F] text-[#131313] font-semibold' : 'text-white/45 hover:text-white/80 hover:bg-white/5'
      )}
    >
      <Icon size={15} className="shrink-0" strokeWidth={active ? 2.5 : 2} />
      {label}
    </Link>
  );
}

// ─── Mobile: bottom nav item ──────────────────────────────────────────────────

function BottomNavItem({ href, label, Icon }: { href: string; label: string; Icon: React.ElementType }) {
  const pathname = usePathname();
  const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-0.5 px-3 py-2 min-w-[52px]"
    >
      <div className={cn(
        'w-10 h-7 rounded-full flex items-center justify-center transition-colors',
        active ? 'bg-[#111111]' : 'bg-transparent'
      )}>
        <Icon
          size={20}
          strokeWidth={active ? 2.5 : 1.8}
          className={active ? 'text-white' : 'text-[#6B7280]'}
        />
      </div>
      <span className={cn(
        'text-[10px] font-medium leading-none',
        active ? 'text-[#111111] font-semibold' : 'text-[#9CA3AF]'
      )}>
        {label}
      </span>
    </Link>
  );
}

// ─── Mobile: "Más" full-screen drawer ────────────────────────────────────────

function MasDrawer({ onClose, userInitials, userEmail, handleSignOut }: { onClose: () => void; userInitials: string; userEmail: string; handleSignOut: () => void }) {
  const pathname = usePathname();

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: '#111111' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-12 pb-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
        <span className="text-white font-semibold text-[16px]">Menú</span>
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
        >
          <X size={18} className="text-white/60" />
        </button>
      </div>

      {/* All sections */}
      <nav className="flex-1 overflow-y-auto px-4 py-3">
        {navSections.map((section, si) => (
          <div key={si} className="mb-2">
            {section.label && (
              <p className="px-3 pt-3 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-white/25">
                {section.label}
              </p>
            )}
            {section.items.map(item => {
              const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className={cn(
                    'flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-[15px] font-medium transition-all mb-1',
                    active ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white/80 hover:bg-white/5'
                  )}
                >
                  <item.icon size={18} strokeWidth={active ? 2.5 : 2} />
                  {item.label}
                  {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-white/60" />}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* User */}
      <div className="px-4 pb-8 pt-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
        <div className="flex items-center gap-3 px-4 py-3.5 rounded-xl" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-bold text-white shrink-0" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
            {userInitials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-semibold text-white leading-tight truncate">{userEmail}</p>
          </div>
          <button onClick={handleSignOut} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
            <LogOut size={16} className="text-white/40" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Sidebar (desktop) + bottom nav (mobile) ──────────────────────────────────

export function Sidebar() {
  const [masOpen, setMasOpen] = useState(false);
  const { user, signOut } = useAuth();
  const router = useRouter();

  async function handleSignOut() {
    await signOut();
    // Auth gate is disabled for the audit; stay in the app instead of the login page.
    router.replace('/dashboard');
  }

  const userInitials = user?.email?.slice(0, 2).toUpperCase() ?? 'TE';
  const userEmail = user?.email ?? 'Modo auditoría';

  return (
    <>
      {/* ── Mobile top bar ─────────────────────────────────────────────────── */}
      <div
        className="lg:hidden fixed top-0 left-0 right-0 z-30 flex items-center px-5 h-12 border-b"
        style={{ backgroundColor: '#ffffff', borderColor: '#E8EAED' }}
      >
        <Image src="/logo-light.png" alt="Tentare" width={100} height={36} className="h-7 w-auto object-contain" />
      </div>

      {/* ── Mobile bottom nav ──────────────────────────────────────────────── */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-30 flex items-center justify-around px-2 border-t"
        style={{ backgroundColor: '#ffffff', borderColor: '#E8EAED', paddingBottom: 'env(safe-area-inset-bottom, 0px)', height: 'calc(56px + env(safe-area-inset-bottom, 0px))' }}
      >
        {bottomNavItems.map(item => (
          <BottomNavItem key={item.href} href={item.href} label={item.label} Icon={item.icon} />
        ))}
        {/* Más button */}
        <button
          onClick={() => setMasOpen(true)}
          className="flex flex-col items-center gap-0.5 px-3 py-2 min-w-[52px]"
        >
          <div className="w-10 h-7 rounded-full flex items-center justify-center">
            <Menu size={20} strokeWidth={1.8} className="text-[#6B7280]" />
          </div>
          <span className="text-[10px] font-medium text-[#9CA3AF] leading-none">Más</span>
        </button>
      </nav>

      {/* ── Mobile "Más" drawer ────────────────────────────────────────────── */}
      {masOpen && <MasDrawer onClose={() => setMasOpen(false)} userInitials={userInitials} userEmail={userEmail} handleSignOut={handleSignOut} />}

      {/* ── Desktop sidebar ────────────────────────────────────────────────── */}
      <aside
        className="hidden lg:flex fixed inset-y-0 left-0 z-20 flex-col w-56"
        style={{ backgroundColor: '#111111' }}
      >
        {/* Logo */}
        <div
          className="flex items-center gap-2.5 px-4 h-14 shrink-0 border-b"
          style={{ borderColor: 'rgba(255,255,255,0.07)' }}
        >
          <Image src="/logo-transparent.png" alt="Tentare" width={90} height={40} className="h-8 w-auto object-contain" />
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
          <GlobalSearch />
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-2 overflow-y-auto space-y-1">
          {navSections.map((section, si) => (
            <div key={si}>
              {section.label && (
                <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-white/20">
                  {section.label}
                </p>
              )}
              {section.items.map(item => (
                <NavItem key={item.href} href={item.href} label={item.label} Icon={item.icon} />
              ))}
            </div>
          ))}
        </nav>

        {/* External links */}
        <div className="px-3 pb-2 space-y-0.5">
          <Link
            href="/kiosk"
            target="_blank"
            className="flex items-center justify-between px-3 py-2 rounded-lg text-[11px] font-medium transition-colors hover:bg-white/5"
            style={{ color: 'rgba(255,255,255,0.35)' }}
          >
            <span>Modo quiosco</span>
            <span style={{ color: 'rgba(255,255,255,0.2)' }}>→</span>
          </Link>
          <Link
            href="/reservar"
            target="_blank"
            className="flex items-center justify-between px-3 py-2 rounded-lg text-[11px] font-medium transition-colors hover:bg-white/5"
            style={{ color: 'rgba(255,255,255,0.35)' }}
          >
            <span>Portal de reservas</span>
            <span style={{ color: 'rgba(255,255,255,0.2)' }}>→</span>
          </Link>
          <Link
            href="/portal/login"
            target="_blank"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-medium transition-colors hover:bg-white/5 text-[#4F46E5]"
          >
            <ExternalLink size={12} className="shrink-0" />
            <span>Portal miembros</span>
          </Link>
        </div>

        {/* User */}
        <div className="px-3 py-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
          <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg">
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold text-white"
              style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
            >
              {userInitials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium text-white/75 truncate leading-tight">{userEmail}</p>
            </div>
            <button
              onClick={handleSignOut}
              title="Cerrar sesión"
              className="p-1.5 rounded-lg transition-colors hover:bg-white/10"
            >
              <LogOut size={13} className="text-white/30 hover:text-white/60" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
