'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Calendar, Users, CreditCard,
  FileText, Settings, BarChart2, ChevronRight, ChevronLeft, X,
  Clock, ShoppingCart, MessageCircle, Megaphone, Play, Bell,
  Menu, Bot, ArrowLeftRight, Package, Store, Inbox, ExternalLink,
  LogOut, UserCog, Monitor,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { GlobalSearch } from '@/components/search/global-search';
import { useAuth } from '@/lib/auth-context';
import { useStudio } from '@/lib/studio-context';
import { ProfileAvatar } from '@/components/ui/profile-avatar';
import { usePermisos } from '@/lib/permisos';

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

function NavItem({ href, label, Icon, onClick, collapsed }: { href: string; label: string; Icon: React.ElementType; onClick?: () => void; collapsed?: boolean }) {
  const pathname = usePathname();
  const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
  return (
    <Link
      href={href}
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={cn(
        'flex items-center rounded-full text-[13px] font-medium transition-all relative',
        collapsed ? 'justify-center w-10 h-10 mx-auto' : 'gap-2.5 px-3 py-2',
        active ? 'bg-[#FFC8E2] text-[#131313] font-semibold' : 'text-white/45 hover:text-white/80 hover:bg-white/5'
      )}
    >
      <Icon size={15} className="shrink-0" strokeWidth={active ? 2.5 : 2} />
      {!collapsed && label}
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
        active ? 'bg-[#FFC8E2]' : 'bg-transparent'
      )}>
        <Icon
          size={20}
          strokeWidth={active ? 2.5 : 1.8}
          className={active ? 'text-[#131313]' : 'text-[#8E8E86]'}
        />
      </div>
      <span className={cn(
        'text-[10px] font-medium leading-none',
        active ? 'text-[#1A1A1A] font-semibold' : 'text-[#A8A89F]'
      )}>
        {label}
      </span>
    </Link>
  );
}

// ─── Mobile: "Más" full-screen drawer ────────────────────────────────────────

function MasDrawer({ onClose, userInitials, userEmail, handleSignOut, sections }: {
  onClose: () => void; userInitials: string; userEmail: string; handleSignOut: () => void;
  sections: typeof navSections;
}) {
  const pathname = usePathname();

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: '#1A1A1A' }}>
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
        {sections.map((section, si) => (
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
                    'flex items-center gap-3.5 px-4 py-3.5 rounded-full text-[15px] font-medium transition-all mb-1',
                    active ? 'bg-[#FFC8E2] text-[#131313] font-semibold' : 'text-white/50 hover:text-white/80 hover:bg-white/5'
                  )}
                >
                  <item.icon size={18} strokeWidth={active ? 2.5 : 2} />
                  {item.label}
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

const SIDEBAR_W_EXPANDED = '256px';
const SIDEBAR_W_COLLAPSED = '96px';

export function Sidebar() {
  const [masOpen, setMasOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const { user, signOut } = useAuth();
  const { studio } = useStudio();
  const studioSlug = studio?.slug ?? 'tentare';
  const { puedeVer } = usePermisos();
  const router = useRouter();

  const seccionesVisibles = navSections
    .map(s => ({ ...s, items: s.items.filter(i => puedeVer(i.href)) }))
    .filter(s => s.items.length > 0);
  const bottomNavVisibles = bottomNavItems.filter(i => puedeVer(i.href));

  // Restore the collapsed preference and keep the shared --sidebar-w CSS var
  // (read by the dashboard layout's <main> padding) in sync with it.
  useEffect(() => {
    const stored = localStorage.getItem('sidebar-collapsed') === '1';
    setCollapsed(stored);
    document.documentElement.style.setProperty('--sidebar-w', stored ? SIDEBAR_W_COLLAPSED : SIDEBAR_W_EXPANDED);
  }, []);

  function toggleCollapsed() {
    setCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('sidebar-collapsed', next ? '1' : '0');
      document.documentElement.style.setProperty('--sidebar-w', next ? SIDEBAR_W_COLLAPSED : SIDEBAR_W_EXPANDED);
      return next;
    });
  }

  async function handleSignOut() {
    await signOut();
    router.replace('/login');
  }

  const userInitials = user?.email?.slice(0, 2).toUpperCase() ?? 'TE';
  const userEmail = user?.email ?? 'Modo auditoría';

  return (
    <>
      {/* ── Mobile top bar ─────────────────────────────────────────────────── */}
      <div
        className="lg:hidden fixed top-0 left-0 right-0 z-30 flex items-center px-5 h-12 border-b"
        style={{ backgroundColor: '#ffffff', borderColor: '#E7E7E0' }}
      >
        <Image src="/logo-horizontal.png" alt="Tentare" width={100} height={69} className="h-9 w-auto object-contain" />
      </div>

      {/* ── Mobile bottom nav ──────────────────────────────────────────────── */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-30 flex items-center justify-around px-2 border-t"
        style={{ backgroundColor: '#ffffff', borderColor: '#E7E7E0', paddingBottom: 'env(safe-area-inset-bottom, 0px)', height: 'calc(56px + env(safe-area-inset-bottom, 0px))' }}
      >
        {bottomNavVisibles.map(item => (
          <BottomNavItem key={item.href} href={item.href} label={item.label} Icon={item.icon} />
        ))}
        {/* Más button */}
        <button
          onClick={() => setMasOpen(true)}
          className="flex flex-col items-center gap-0.5 px-3 py-2 min-w-[52px]"
        >
          <div className="w-10 h-7 rounded-full flex items-center justify-center">
            <Menu size={20} strokeWidth={1.8} className="text-[#8E8E86]" />
          </div>
          <span className="text-[10px] font-medium text-[#A8A89F] leading-none">Más</span>
        </button>
      </nav>

      {/* ── Mobile "Más" drawer ────────────────────────────────────────────── */}
      {masOpen && <MasDrawer onClose={() => setMasOpen(false)} userInitials={userInitials} userEmail={userEmail} handleSignOut={handleSignOut} sections={seccionesVisibles} />}

      {/* ── Desktop sidebar (floating black pill — Midbox) ─────────────────── */}
      <aside
        className={cn(
          'hidden lg:flex fixed top-4 left-4 bottom-4 z-20 flex-col rounded-[28px] overflow-hidden transition-[width] duration-200',
          collapsed ? 'w-16' : 'w-56',
        )}
        style={{ backgroundColor: '#0A0A0A' }}
      >
        {/* Logo */}
        <div
          className={cn('flex items-center h-14 shrink-0 border-b', collapsed ? 'justify-center px-2' : 'gap-2.5 px-4')}
          style={{ borderColor: 'rgba(255,255,255,0.07)' }}
        >
          {collapsed ? (
            <div className="w-11 h-11 rounded-full bg-[#FFC8E2] flex items-center justify-center p-1">
              <Image src="/logo-icon.png" alt="Tentare" width={36} height={36} className="w-full h-full object-contain" />
            </div>
          ) : (
            <>
              {/* El icono del logo tiene tinta oscura (ilegible directamente sobre este fondo
                  casi negro) — se apoya sobre el círculo rosa para mantener contraste. */}
              <div className="w-11 h-11 shrink-0 rounded-full bg-[#FFC8E2] flex items-center justify-center p-1">
                <Image src="/logo-icon.png" alt="Tentare" width={36} height={36} className="w-full h-full object-contain" />
              </div>
              <span className="text-white text-[15px] font-bold tracking-tight">Tentare</span>
            </>
          )}
        </div>

        {/* Search */}
        <div className={cn('py-2 border-b', collapsed ? 'px-2' : 'px-3')} style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
          <GlobalSearch collapsed={collapsed} />
        </div>

        {/* Nav */}
        <nav className={cn('flex-1 py-2 overflow-y-auto space-y-1', collapsed ? 'px-2' : 'px-2')}>
          {seccionesVisibles.map((section, si) => (
            <div key={si}>
              {section.label && !collapsed && (
                <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-white/20">
                  {section.label}
                </p>
              )}
              {section.label && collapsed && si > 0 && (
                <div className="mx-3 my-2 border-t" style={{ borderColor: 'rgba(255,255,255,0.07)' }} />
              )}
              {section.items.map(item => (
                <NavItem key={item.href} href={item.href} label={item.label} Icon={item.icon} collapsed={collapsed} />
              ))}
            </div>
          ))}
        </nav>

        {/* External links */}
        {collapsed ? (
          <div className="px-2 pb-2 flex flex-col items-center gap-0.5">
            <Link href={`/kiosk/${studioSlug}`} target="_blank" title="Modo quiosco" className="flex items-center justify-center w-10 h-10 rounded-full transition-colors hover:bg-white/5" style={{ color: 'rgba(255,255,255,0.35)' }}>
              <Monitor size={15} />
            </Link>
            <Link href={`/reservar/${studioSlug}`} target="_blank" title="Portal de reservas" className="flex items-center justify-center w-10 h-10 rounded-full transition-colors hover:bg-white/5" style={{ color: 'rgba(255,255,255,0.35)' }}>
              <Calendar size={15} />
            </Link>
            <Link href={`/portal/${studioSlug}/login`} target="_blank" title="Portal miembros" className="flex items-center justify-center w-10 h-10 rounded-full transition-colors hover:bg-white/5 text-[#F7A6C4]">
              <ExternalLink size={15} />
            </Link>
          </div>
        ) : (
          <div className="px-3 pb-2 space-y-0.5">
            <Link
              href={`/kiosk/${studioSlug}`}
              target="_blank"
              className="flex items-center justify-between px-3 py-2 rounded-lg text-[11px] font-medium transition-colors hover:bg-white/5"
              style={{ color: 'rgba(255,255,255,0.35)' }}
            >
              <span>Modo quiosco</span>
              <span style={{ color: 'rgba(255,255,255,0.2)' }}>→</span>
            </Link>
            <Link
              href={`/reservar/${studioSlug}`}
              target="_blank"
              className="flex items-center justify-between px-3 py-2 rounded-lg text-[11px] font-medium transition-colors hover:bg-white/5"
              style={{ color: 'rgba(255,255,255,0.35)' }}
            >
              <span>Portal de reservas</span>
              <span style={{ color: 'rgba(255,255,255,0.2)' }}>→</span>
            </Link>
            <Link
              href={`/portal/${studioSlug}/login`}
              target="_blank"
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-medium transition-colors hover:bg-white/5 text-[#F7A6C4]"
            >
              <ExternalLink size={12} className="shrink-0" />
              <span>Portal miembros</span>
            </Link>
          </div>
        )}

        {/* User */}
        <div className="px-3 py-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
          <div className={cn('flex items-center gap-2.5 rounded-lg', collapsed ? 'justify-center px-0 py-2' : 'px-2 py-2')}>
            <Link href="/configuracion" title="Editar mi perfil" className="shrink-0">
              <ProfileAvatar avatarId={studio?.avatarAdmin} nombre={userInitials} size="xs" />
            </Link>
            {!collapsed && (
              <>
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
              </>
            )}
          </div>
        </div>

        {/* Collapse / expand toggle */}
        <button
          onClick={toggleCollapsed}
          title={collapsed ? 'Expandir menú' : 'Contraer menú'}
          className="flex items-center justify-center h-9 shrink-0 border-t transition-colors hover:bg-white/5 text-white/30 hover:text-white/70"
          style={{ borderColor: 'rgba(255,255,255,0.07)' }}
        >
          {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
        </button>
      </aside>
    </>
  );
}
