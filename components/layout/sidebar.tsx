'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import {
  X, Menu, LogOut, Check, PanelLeft, ExternalLink,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import { useStudio } from '@/lib/studio-context';
import { ProfileAvatar } from '@/components/ui/profile-avatar';
import { usePermisos } from '@/lib/permisos';
import { navSections, bottomNavItems, ESSENTIAL_HREFS } from '@/lib/nav-config';
import { fetchLayout } from '@/lib/api-client';
import { filtrarItemsMenu } from '@/lib/layout-runtime';

export function useNavMode() {
  // Por defecto 'esencial' (6 módulos del día a día): un estudio nuevo no se
  // ahoga entre 19 opciones, y en móvil la barra inferior cubre casi todo sin
  // enterrar nada en "Más". Quien ya eligió "Todo" a mano se respeta.
  const [mode, setMode] = useState<'esencial' | 'avanzado'>('esencial');

  useEffect(() => {
    const stored = localStorage.getItem('nav-mode');
    if (stored === 'avanzado') setMode('avanzado');
  }, []);

  function setNavMode(next: 'esencial' | 'avanzado') {
    setMode(next);
    localStorage.setItem('nav-mode', next);
  }

  return { mode, setNavMode };
}

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
        active ? 'bg-brand text-brand-foreground font-semibold' : 'text-white/45 hover:text-white/80 hover:bg-card/5'
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
        active ? 'bg-brand' : 'bg-transparent'
      )}>
        <Icon
          size={20}
          strokeWidth={active ? 2.5 : 1.8}
          className={active ? 'text-brand-foreground' : 'text-muted-foreground'}
        />
      </div>
      <span className={cn(
        'text-[10px] font-medium leading-none',
        active ? 'text-foreground font-semibold' : 'text-muted-foreground'
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
    <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: 'var(--foreground)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-12 pb-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
        <span className="text-white font-semibold text-[16px]">Menú</span>
        <button
          onClick={onClose}
          aria-label="Cerrar el menú"
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
                    active ? 'bg-brand text-brand-foreground font-semibold' : 'text-white/50 hover:text-white/80 hover:bg-card/5'
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
          <button onClick={handleSignOut} aria-label="Cerrar sesión" className="p-2 rounded-lg hover:bg-card/10 transition-colors">
            <LogOut size={16} className="text-white/40" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Sidebar (desktop) + bottom nav (mobile) ──────────────────────────────────

type SidebarSize = 'compacto' | 'normal' | 'grande';

const SIDEBAR_SIZES: Record<SidebarSize, { aside: string; cssVar: string; label: string }> = {
  compacto: { aside: 'w-16', cssVar: '96px', label: 'Pequeño' },
  normal: { aside: 'w-56', cssVar: '256px', label: 'Normal' },
  grande: { aside: 'w-72', cssVar: '320px', label: 'Grande' },
};

export function Sidebar() {
  const [masOpen, setMasOpen] = useState(false);
  const [size, setSize] = useState<SidebarSize>('normal');
  const [sizeMenuOpen, setSizeMenuOpen] = useState(false);
  const { user, signOut } = useAuth();
  const { studio } = useStudio();
  const studioSlug = studio?.slug ?? 'tentare';
  const { puedeVer } = usePermisos();
  const router = useRouter();
  const { mode: navMode, setNavMode } = useNavMode();

  const collapsed = size === 'compacto';

  // Módulos que este estudio ha decidido no usar. Se leen una vez al montar; si
  // falla la carga, `ocultos` queda vacío y se ve todo (mejor de más que de
  // menos: esconder por un error de red dejaría a alguien sin encontrar su
  // trabajo). NO_OCULTABLES protege lo imprescindible en lib/nav-config.tsx.
  const [ocultos, setOcultos] = useState<Set<string>>(new Set());
  useEffect(() => {
    let vivo = true;
    fetchLayout()
      .then(l => { if (vivo) setOcultos(new Set(l.ocultos)); })
      .catch(() => {});
    return () => { vivo = false; };
  }, []);

  const seccionesVisibles = navSections
    .map(s => ({
      ...s,
      items: filtrarItemsMenu(s.items, { puedeVer, ocultos, modo: navMode, esenciales: ESSENTIAL_HREFS }),
    }))
    .filter(s => s.items.length > 0);
  // La barra inferior de móvil no distingue esencial/avanzado: son las cuatro
  // de siempre, así que se pasa 'avanzado' y manda solo permiso + ocultos.
  const bottomNavVisibles = filtrarItemsMenu(bottomNavItems, {
    puedeVer, ocultos, modo: 'avanzado', esenciales: ESSENTIAL_HREFS,
  });

  function applySize(next: SidebarSize) {
    setSize(next);
    localStorage.setItem('sidebar-size', next);
    document.documentElement.style.setProperty('--sidebar-w', SIDEBAR_SIZES[next].cssVar);
  }

  // Restore the size preference (migrating the old binary "collapsed" flag if
  // present) and keep the shared --sidebar-w CSS var (read by the dashboard
  // layout's <main> padding) in sync with it.
  useEffect(() => {
    const storedSize = localStorage.getItem('sidebar-size') as SidebarSize | null;
    const legacyCollapsed = localStorage.getItem('sidebar-collapsed');
    const initial: SidebarSize = storedSize ?? (legacyCollapsed === '1' ? 'compacto' : 'normal');
    setSize(initial);
    document.documentElement.style.setProperty('--sidebar-w', SIDEBAR_SIZES[initial].cssVar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        style={{ backgroundColor: '#ffffff', borderColor: 'var(--border)' }}
      >
        <Image src="/logo-horizontal.png" alt="Tentare" width={100} height={69} className="h-9 w-auto object-contain" />
      </div>

      {/* ── Mobile bottom nav ──────────────────────────────────────────────── */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-30 flex items-center justify-around px-2 border-t"
        style={{ backgroundColor: '#ffffff', borderColor: 'var(--border)', paddingBottom: 'env(safe-area-inset-bottom, 0px)', height: 'calc(56px + env(safe-area-inset-bottom, 0px))' }}
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
            <Menu size={20} strokeWidth={1.8} className="text-muted-foreground" />
          </div>
          <span className="text-[10px] font-medium text-muted-foreground leading-none">Más</span>
        </button>
      </nav>

      {/* ── Mobile "Más" drawer ────────────────────────────────────────────── */}
      {masOpen && <MasDrawer onClose={() => setMasOpen(false)} userInitials={userInitials} userEmail={userEmail} handleSignOut={handleSignOut} sections={seccionesVisibles} />}

      {/* ── Desktop logo (fuera de la píldora del menú) ─────────────────────── */}
      <div
        className={cn(
          'hidden lg:flex fixed top-4 left-4 z-20 items-center justify-center h-20 shrink-0 transition-[width] duration-200',
          SIDEBAR_SIZES[size].aside,
        )}
      >
        {collapsed ? (
          <Image src="/logo-icon.png" alt="Tentare" width={56} height={56} className="w-14 h-14 object-contain" />
        ) : (
          <Image src="/logo-horizontal.png" alt="Tentare" width={260} height={120} className="h-16 w-auto object-contain" />
        )}
      </div>

      {/* ── Desktop sidebar (floating black pill — Midbox) ─────────────────── */}
      <aside
        className={cn(
          'hidden lg:flex fixed top-[104px] left-4 bottom-4 z-20 flex-col rounded-[28px] overflow-hidden transition-[width] duration-200',
          SIDEBAR_SIZES[size].aside,
        )}
        style={{ backgroundColor: '#0A0A0A' }}
      >
        {/* Modo Esencial / Avanzado */}
        {!collapsed && (
          <div className="px-3 pt-2.5 pb-1">
            <div className="flex gap-0.5 p-0.5 rounded-full bg-card/5">
              {([['esencial', 'Esencial'], ['avanzado', 'Todo']] as const).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setNavMode(val)}
                  title={val === 'esencial' ? 'Solo el día a día: agenda, clientes, cobros, equipo e informes' : 'Todas las funciones'}
                  className={cn(
                    'flex-1 py-1 rounded-full text-[10.5px] font-bold transition-all',
                    navMode === val ? 'bg-brand text-brand-foreground' : 'text-white/40',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

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
            <Link href={`/portal/${studioSlug}/login`} target="_blank" title="Portal clientes" className="flex items-center justify-center w-10 h-10 rounded-full transition-colors hover:bg-card/5 text-brand">
              <ExternalLink size={15} />
            </Link>
          </div>
        ) : (
          <div className="px-3 pb-2 space-y-0.5">
            <Link
              href={`/portal/${studioSlug}/login`}
              target="_blank"
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-medium transition-colors hover:bg-card/5 text-brand"
            >
              <ExternalLink size={12} className="shrink-0" />
              <span>Portal clientes</span>
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
                  className="p-1.5 rounded-lg transition-colors hover:bg-card/10"
                >
                  <LogOut size={13} className="text-white/30 hover:text-white/60" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Size menu: Pequeño / Normal / Grande */}
        <div className="relative shrink-0 border-t" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
          {sizeMenuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setSizeMenuOpen(false)} />
              <div className="absolute bottom-full left-2 right-2 z-20 mb-1.5 rounded-xl overflow-hidden shadow-lg border" style={{ backgroundColor: '#171717', borderColor: 'rgba(255,255,255,0.08)' }}>
                {(Object.keys(SIDEBAR_SIZES) as SidebarSize[]).map(key => (
                  <button
                    key={key}
                    onClick={() => { applySize(key); setSizeMenuOpen(false); }}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-[12px] font-semibold text-white/70 hover:bg-card/5 hover:text-white transition-colors text-left"
                  >
                    {SIDEBAR_SIZES[key].label}
                    {size === key && <Check size={13} className="text-brand shrink-0" />}
                  </button>
                ))}
              </div>
            </>
          )}
          <button
            onClick={() => setSizeMenuOpen(v => !v)}
            title="Tamaño del menú"
            className={cn(
              'flex items-center h-9 w-full transition-colors hover:bg-card/5 text-white/30 hover:text-white/70',
              collapsed ? 'justify-center' : 'justify-center gap-2',
            )}
          >
            <PanelLeft size={14} />
            {!collapsed && <span className="text-[11px] font-semibold">{SIDEBAR_SIZES[size].label}</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
