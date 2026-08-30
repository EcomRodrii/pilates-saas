'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  X, Menu, LogOut, Check, PanelLeft, ExternalLink,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import { useCore } from '@/lib/core-context';
import { ProfileAvatar } from '@/components/ui/profile-avatar';
import { usePermisos, nombreAppPorRol } from '@/lib/permisos';
import { navSections, bottomNavItems, ESSENTIAL_HREFS } from '@/lib/nav-config';
import { useMenuNovedades } from '@/lib/menu-novedades-cliente';
import { fetchLayout } from '@/lib/api-client';
import { filtrarItemsMenu } from '@/lib/layout-runtime';
import { SedeActiva } from '@/components/layout/sede-activa';
import { LogoTentare, type AnimacionMarca } from '@/components/marca/logo-tentare';
import { PildoraPrueba } from '@/components/billing/pildora-prueba';

export function useNavMode() {
  // Por defecto 'esencial' (6 módulos del día a día): un estudio nuevo no se
  // ahoga entre 19 opciones, y en móvil la barra inferior cubre casi todo sin
  // enterrar nada en "Más". Quien ya eligió "Todo" a mano se respeta.
  const [mode, setMode] = useState<'esencial' | 'avanzado'>('esencial');

  useEffect(() => {
    const stored = localStorage.getItem('nav-mode');
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Lee localStorage. No es accesible durante el render (ni en servidor ni en la hidratación): leerlo en render rompería la hidratación.
    if (stored === 'avanzado') setMode('avanzado');
  }, []);

  function setNavMode(next: 'esencial' | 'avanzado') {
    setMode(next);
    localStorage.setItem('nav-mode', next);
  }

  return { mode, setNavMode };
}

// ─── Desktop nav item ─────────────────────────────────────────────────────────

// Distintivo «NUEVO»: lo que Tentare señala desde /interno (ver
// lib/menu-novedades.ts). Arena sobre el casi negro del menú — NO `bg-brand`,
// que es el relleno del item ACTIVO: si compartieran color, «nuevo» y «donde
// estás» se leerían igual.
//
// ⚠️ `sidebar-primary-foreground`/`sidebar` y no `brand-foreground`: el menú es
// una superficie SIEMPRE oscura, también en modo claro, y los tokens de marca
// se INVIERTEN en oscuro (`--brand-foreground` pasa a #16161A) — el badge se
// volvería negro sobre negro la mitad del tiempo. Los `--sidebar-*` no se
// redefinen nunca, justo por esto.
function BadgeNuevo({ compacto }: { compacto?: boolean }) {
  // Colapsado no hay sitio para la palabra: un punto en la esquina del icono,
  // con el texto accesible para quien no ve el color.
  if (compacto) {
    return (
      <span
        className="absolute right-1.5 top-1.5 size-2 rounded-full bg-sidebar-primary-foreground ring-2 ring-sidebar"
        role="status"
      >
        <span className="sr-only">Nuevo</span>
      </span>
    );
  }
  return (
    <span className="ml-auto rounded-full bg-sidebar-primary-foreground px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-sidebar">
      Nuevo
    </span>
  );
}

function NavItem({ href, label, Icon, onClick, collapsed, nuevo }: { href: string; label: string; Icon: React.ElementType; onClick?: () => void; collapsed?: boolean; nuevo?: boolean }) {
  const pathname = usePathname();
  const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
  return (
    <Link
      href={href}
      onClick={onClick}
      title={collapsed ? (nuevo ? `${label} (nuevo)` : label) : undefined}
      className={cn(
        'flex items-center rounded-full text-[13px] font-medium transition-all relative',
        collapsed ? 'justify-center w-10 h-10 mx-auto' : 'gap-2.5 px-3 py-2',
        active ? 'bg-brand text-brand-foreground font-semibold' : 'text-white/45 hover:text-white/80 hover:bg-card/5'
      )}
    >
      <Icon size={15} className="shrink-0" strokeWidth={active ? 2.5 : 2} />
      {!collapsed && label}
      {nuevo && <BadgeNuevo compacto={collapsed} />}
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
        'w-10 h-7 rounded-full flex items-center justify-center transition-[background-color,transform] duration-150 active:scale-90',
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

function MasDrawer({ open, onClose, userInitials, userEmail, handleSignOut, sections }: {
  open: boolean; onClose: () => void; userInitials: string; userEmail: string; handleSignOut: () => void;
  sections: typeof navSections;
}) {
  const pathname = usePathname();
  const conNovedad = useMenuNovedades();

  // Aparecía/desaparecía de golpe (auditoría de motion) — mismo patrón que
  // DashboardDrawer (components/ui/dashboard-drawer.tsx): se queda montado
  // un instante más al cerrar para que se vea la salida.
  const [rendered, setRendered] = useState(open);
  const [cerrando, setCerrando] = useState(false);
  const [abiertoPrevio, setAbiertoPrevio] = useState(open);
  if (open !== abiertoPrevio) {
    setAbiertoPrevio(open);
    if (open) { setRendered(true); setCerrando(false); }
    else if (rendered) setCerrando(true);
  }
  if (!rendered) return null;

  return (
    // --sidebar (#0F0F0F en los dos modos), no --foreground: este cajón es una
    // superficie SIEMPRE oscura —todo su contenido va en text-white— y
    // --foreground se INVIERTE en modo oscuro, así que el menú entero quedaba
    // en blanco sobre blanco. Mismo criterio que el sidebar de escritorio.
    <div
      className={cn('fixed inset-0 z-50 flex flex-col', cerrando ? 'mas-drawer-out' : 'mas-drawer-in')}
      style={{ backgroundColor: 'var(--sidebar)' }}
      onAnimationEnd={() => { if (cerrando) setRendered(false); }}
    >
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

      {/* En móvil no hay sidebar ni topbar, así que este menú es el único sitio
          donde cabe la sede activa. Quien opera desde el móvil suele ser
          recepción: es justo quien no debe cobrar en el centro equivocado. */}
      <div className="px-4 pt-3">
        <SedeActiva variante="sidebar" />
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
                  {conNovedad.has(item.href) && <BadgeNuevo />}
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
  // Los `href` señalados como NUEVO desde /interno.
  const conNovedad = useMenuNovedades();
  const [masOpen, setMasOpen] = useState(false);
  const [size, setSize] = useState<SidebarSize>('normal');
  const [sizeMenuOpen, setSizeMenuOpen] = useState(false);
  // El logo se monta por piezas al abrir el panel y, cuando termina, se queda
  // con el barrido de luz al pasar el ratón. Una sola vez por carga de página:
  // Sidebar vive en el layout del dashboard, así que navegar entre pantallas NO
  // lo remonta y el splash no se repite a cada clic.
  const [animacionLogo, setAnimacionLogo] = useState<AnimacionMarca>('construccion');
  useEffect(() => {
    // 1,1 s = lo que tarda la última pieza (disco: 0,45 s de retardo + 0,45 s).
    const t = setTimeout(() => setAnimacionLogo('barrido'), 1100);
    return () => clearTimeout(t);
  }, []);
  const { user, signOut } = useAuth();
  const { studio, instructores } = useCore();
  // F4·E5: el enlace al Portal debe derivar SIEMPRE de la sede activa (studio.slug).
  // El antiguo fallback a 'tentare' apuntaba a un estudio AJENO mientras el estudio
  // cargaba o en una cadena multi-sede → enlace cross-tenant. Sin slug aún: no se pinta.
  const studioSlug = studio?.slug ?? null;
  // El avatar de cabecera es el de QUIEN ha iniciado sesión, no siempre el de
  // la propietaria: si es una instructora/recepción con ficha propia, se usa
  // la suya (avatar y foto reales), igual que en Configuración > Mi perfil.
  const yo = instructores.find(i => i.authUserId === user?.id) ?? null;
  const { rol, puedeVer } = usePermisos();
  // Mientras `studio` no ha cargado, `useRol()` cae al mínimo (INSTRUCTOR,
  // fail-closed de A-2 en lib/permisos.ts) — sin este guard se veía el logo/
  // título de Tentare Core un instante en CUALQUIER rol, incluida la
  // propietaria, antes de resolver el real. El genérico "Tentare" no afirma
  // un rol que todavía no se conoce (mismo criterio que
  // app/(dashboard)/layout.tsx, que gatea igual con `rolResuelto`).
  const rolResuelto = studio !== null;
  const marca = rolResuelto ? nombreAppPorRol(rol) : 'Tentare';
  // Solo hay lockup horizontal por rol (isotipo + palabra + nombre de producto
  // en fila); el logo colapsado (solo isotipo) y el de /login siguen siendo el
  // genérico Tentare hasta que haya un caso de uso que lo pida — el rol no se
  // conoce antes de autenticar. Sin rol resuelto no se pasa `producto`, así
  // que se pinta la marca paraguas.
  const producto = !rolResuelto ? undefined : rol === 'INSTRUCTOR' ? 'core' : 'manager';
  const router = useRouter();
  const { mode: navMode, setNavMode } = useNavMode();

  const collapsed = size === 'compacto';

  // Módulos que este estudio ha decidido no usar. Se leen una vez al montar; si
  // falla la carga, `ocultos` queda vacío y se ve todo (mejor de más que de
  // menos: esconder por un error de red dejaría a alguien sin encontrar su
  // trabajo). NO_OCULTABLES protege lo imprescindible en lib/nav-config.ts.
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Lee localStorage y escribe una custom property en document.documentElement. Ambas cosas son el DOM, un sistema externo.
    setSize(initial);
    document.documentElement.style.setProperty('--sidebar-w', SIDEBAR_SIZES[initial].cssVar);
  }, []);

  async function handleSignOut() {
    await signOut();
    router.replace('/login');
  }

  // Propietaria sin ficha propia (yo === null): usa el nombre que haya
  // guardado en Configuración > Mi perfil (auth.users.user_metadata) en vez
  // de las iniciales del email, si ya lo ha rellenado.
  const metaNombre = user?.user_metadata?.nombre as string | undefined;
  const userInitials = !yo && metaNombre
    ? metaNombre.slice(0, 2).toUpperCase()
    : (user?.email?.slice(0, 2).toUpperCase() ?? 'TE');
  const userEmail = user?.email ?? 'Modo auditoría';

  return (
    <>
      {/* ── Mobile top bar ─────────────────────────────────────────────────── */}
      {/* Las dos barras van con --card, no con '#ffffff'. En claro es el mismo
          blanco, pero fijo las dejaba blancas con el panel en modo oscuro — y
          con ellas el logo, que en tinta `auto` pinta ahí su versión NEGATIVA
          y desaparecía sobre el blanco. */}
      <div
        className="lg:hidden fixed top-0 left-0 right-0 z-30 flex items-center px-5 h-12 border-b"
        style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}
      >
        <LogoTentare formato="horizontal" tinta="auto" producto={producto} titulo={marca} alto={30} />
        {/* La píldora de la prueba también en móvil. `ml-auto` y no un
            `justify-between` en el contenedor: la píldora no se pinta si el
            estudio no está en prueba, y con justify-between el logo se
            quedaría centrado a veces y a la izquierda otras. */}
        <PildoraPrueba className="ml-auto" />
      </div>

      {/* ── Mobile bottom nav ──────────────────────────────────────────────── */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-30 flex items-center justify-around px-2 border-t"
        style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', paddingBottom: 'env(safe-area-inset-bottom, 0px)', height: 'calc(56px + env(safe-area-inset-bottom, 0px))' }}
      >
        {bottomNavVisibles.map(item => (
          <BottomNavItem key={item.href} href={item.href} label={item.label} Icon={item.icon} />
        ))}
        {/* Más button */}
        <button
          onClick={() => setMasOpen(true)}
          className="flex flex-col items-center gap-0.5 px-3 py-2 min-w-[52px]"
        >
          <div className="w-10 h-7 rounded-full flex items-center justify-center transition-transform duration-150 active:scale-90">
            <Menu size={20} strokeWidth={1.8} className="text-muted-foreground" />
          </div>
          <span className="text-[10px] font-medium text-muted-foreground leading-none">Más</span>
        </button>
      </nav>

      {/* ── Mobile "Más" drawer ────────────────────────────────────────────── */}
      <MasDrawer open={masOpen} onClose={() => setMasOpen(false)} userInitials={userInitials} userEmail={userEmail} handleSignOut={handleSignOut} sections={seccionesVisibles} />

      {/* ── Desktop logo (fuera de la píldora del menú) ─────────────────────── */}
      <div
        className={cn(
          'hidden lg:flex fixed top-4 left-4 z-20 items-center justify-center h-20 shrink-0 transition-[width] duration-200',
          SIDEBAR_SIZES[size].aside,
        )}
      >
        {collapsed ? (
          <LogoTentare formato="isotipo" tinta="auto" producto={producto} titulo={marca} alto={46} animacion={animacionLogo} />
        ) : (
          <LogoTentare formato="horizontal" tinta="auto" producto={producto} titulo={marca} alto={52} animacion={animacionLogo} />
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
        {/* Sede activa (solo en cadenas): lo primero de la píldora, porque
            condiciona todo lo que hay debajo. En modo compacto no cabe el
            nombre, y una sede sin nombre no sirve de nada. */}
        {!collapsed && <SedeActiva variante="sidebar" />}

        {/* Modo Esencial / Avanzado */}
        {!collapsed && (
          <div className="px-3 pt-2.5 pb-1">
            <div className="flex gap-0.5 p-0.5 rounded-full bg-card/5">
              {([['esencial', 'Esencial'], ['avanzado', 'Todo']] as const).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setNavMode(val)}
                  title={val === 'esencial' ? 'Solo el día a día: agenda, clientas, cobros, equipo e informes' : 'Todas las funciones'}
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
                <NavItem key={item.href} href={item.href} label={item.label} Icon={item.icon} collapsed={collapsed} nuevo={conNovedad.has(item.href)} />
              ))}
            </div>
          ))}
        </nav>

        {/* External links — solo con la sede activa resuelta (F4·E5: sin slug ajeno) */}
        {studioSlug && (collapsed ? (
          <div className="px-2 pb-2 flex flex-col items-center gap-0.5">
            <Link href={`/portal/${studioSlug}/login`} target="_blank" title="Portal clientes" className="flex items-center justify-center w-10 h-10 rounded-full transition-colors hover:bg-card/5 text-brand-medio">
              <ExternalLink size={15} />
            </Link>
          </div>
        ) : (
          <div className="px-3 pb-2 space-y-0.5">
            <Link
              href={`/portal/${studioSlug}/login`}
              target="_blank"
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-medium transition-colors hover:bg-card/5 text-brand-medio"
            >
              <ExternalLink size={12} className="shrink-0" />
              <span>Portal clientes</span>
            </Link>
          </div>
        ))}

        {/* User */}
        <div className="px-3 py-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
          <div className={cn('flex items-center gap-2.5 rounded-lg', collapsed ? 'justify-center px-0 py-2' : 'px-2 py-2')}>
            <Link href="/configuracion" title="Editar mi perfil" className="shrink-0">
              <ProfileAvatar avatarId={yo ? yo.avatar : studio?.avatarAdmin} fotoUrl={yo ? yo.fotoUrl : studio?.fotoUrl} nombre={userInitials} size="xs" />
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
                  <LogOut size={14} className="text-white/30 hover:text-white/60" />
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
                    {size === key && <Check size={14} className="text-brand-medio shrink-0" />}
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
