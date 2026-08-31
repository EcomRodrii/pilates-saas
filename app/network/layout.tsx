'use client';

// Autoservicio de Tentare Network para la PROFESIONAL — deliberadamente fuera
// de app/(dashboard): antes /network/mi-perfil vivía dentro del panel de
// gestión (DashboardShell), que exige studio/instructores para esa
// auth_user_id (components/layout/dashboard-shell.tsx) — una cuenta que se
// registra solo para Network, sin estudio detrás, se quedaba en un skeleton
// infinito. red_perfiles.auth_user_id es independiente de studio_id por
// diseño (migr 20260813111206); el layout que la envuelve tiene que serlo
// también. El buscador de candidatas (app/(dashboard)/network) SÍ se queda
// en el panel — esa es herramienta de la propietaria/manager/recepción.
//
// Sin sidebar ni topbar de gestión: solo logo + salir. Cada página hija
// decide su propio guard de sesión (mi-perfil/solicitudes → fuera si no hay
// user; unirse → fuera si YA hay user).
//
// Rediseño 2026-08: /network dejó de ser solo autoservicio — ahora también
// vive aquí debajo la landing/marketplace/perfil/acceso PÚBLICOS
// (components/network-v2/), cada uno con su propio nav+pie completos. Antes
// esto se resolvía con una excepción para /network/unirse; con más rutas
// públicas que privadas, se invierte a una lista blanca de las privadas
// (autoservicio de la instructora YA logueada) — todo lo demás bajo
// /network pasa sin la cabecera "logo + salir" ni el `max-w-2xl` que la
// aplastaría a una columna estrecha y apilaría dos barras de navegación.
//
// Rediseño 2026-09 (Fase 1 del rediseño del autoservicio, mockup del
// fundador "EL DISEÑO DEBE SER ASI"): la cabecera gana una fila 1 con
// disponibilidad + campana + avatar (antes solo tenía logo + "Cerrar
// sesión"), y la fila 2 pasa a píldora blanca sobre fondo crema (tokens
// NW_*) en vez de negro sólido, con badges numéricos reales en Oportunidades
// y Solicitudes. Este MISMO fichero se edita en vez de crear un layout
// nuevo en paralelo — ya hacía exactamente el trabajo de "layout
// condicional que envuelve estas 6 rutas", duplicarlo solo daría dos sitios
// que decidir cuándo se actualiza uno de los dos.
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Bell, ChevronDown, LogOut } from 'lucide-react';
import { LogoTentare } from '@/components/marca/logo-tentare';
import { InsigniaBeta } from '@/components/network-v2/InsigniaBeta';
import { NW_FONDO, NW_TINTA, NW_MUTED, NW_MUTED_2, NW_BORDE, NW_PRODUCTO } from '@/components/network-v2/tokens';
import { DISPONIBILIDAD_ESTADOS_NETWORK, DISPONIBILIDAD_ESTADO_LABEL } from '@/lib/network/catalogo.ts';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';
import { cargarCuandoOcioso } from '@/lib/posthog-cliente';
import { PerfilNetworkProvider, usePerfilNetwork } from '@/lib/network/perfil-network-context';

// Secciones del autoservicio (Fase 2, punto 15 del brief: "no solo Mi
// perfil, sino Network con un Inicio"). Deja hueco a propósito: el día que
// exista Mis contrataciones, se añade a este mismo array — ni el layout ni
// RUTAS_AUTOSERVICIO cambian de forma.
//
// Coincidencia por prefijo (no exacta): Oportunidades/Mis candidaturas
// tienen páginas de detalle (/network/oportunidades/[id]) que deben seguir
// dentro del autoservicio (header + subnav), a diferencia de las fichas de
// detalle del lado estudio, que ocultan su subnav por completo.
const SUBNAV = [
  { href: '/network/inicio', label: 'Inicio', badge: null as 'oportunidades' | 'solicitudes' | null },
  { href: '/network/mi-perfil', label: 'Mi perfil', badge: null },
  { href: '/network/oportunidades', label: 'Oportunidades', badge: 'oportunidades' as const },
  { href: '/network/mis-candidaturas', label: 'Mis candidaturas', badge: null },
  { href: '/network/mis-mensajes', label: 'Mensajes', badge: null },
  { href: '/network/solicitudes', label: 'Solicitudes', badge: 'solicitudes' as const },
];

function coincide(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function AvatarCircular({ fotoUrl, nombre, size = 34 }: { fotoUrl: string | null; nombre: string; size?: number }) {
  if (fotoUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- avatar pequeño, foto subida por la instructora
    return <img src={fotoUrl} alt={nombre} className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />;
  }
  const inicial = nombre.trim().charAt(0).toUpperCase() || '?';
  return (
    <div
      className="rounded-full flex items-center justify-center shrink-0 text-[13px] font-extrabold"
      style={{ width: size, height: size, background: NW_PRODUCTO, color: '#fff' }}
    >
      {inicial}
    </div>
  );
}

/** Píldora de disponibilidad — no es un toggle binario, son los 4 estados reales del catálogo. */
function SelectorDisponibilidad() {
  const { perfil, actualizarDisponibilidad } = usePerfilNetwork();
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    function fuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, [abierto]);

  if (!perfil) return null;
  const abierta = perfil.disponibilidadEstado !== 'no_disponible';

  return (
    <div className="relative" ref={ref}>
      {/* Bajo `sm` solo el punto + flecha: el texto más largo del catálogo
          ("Disponible para sustituciones") desborda el header a 375px junto
          al logo+campana+avatar (medido en vivo, scrollWidth > clientWidth) — */}
      <button
        type="button"
        onClick={() => setAbierto(v => !v)}
        disabled={guardando}
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 sm:px-3 py-1.5 text-[12px] font-semibold whitespace-nowrap disabled:opacity-60"
        style={{ border: `1px solid ${NW_BORDE}`, color: NW_TINTA }}
      >
        <span className="w-[7px] h-[7px] rounded-full shrink-0" style={{ background: abierta ? NW_PRODUCTO : NW_MUTED_2 }} />
        <span className="hidden sm:inline">{DISPONIBILIDAD_ESTADO_LABEL[perfil.disponibilidadEstado]}</span>
        <ChevronDown size={12} style={{ color: NW_MUTED_2 }} />
      </button>
      {abierto && (
        <div
          className="absolute right-0 top-[calc(100%+6px)] z-20 w-64 rounded-2xl p-1.5 bg-white"
          style={{ border: `1px solid ${NW_BORDE}`, boxShadow: '0 12px 32px rgba(20,20,15,.12)' }}
        >
          {DISPONIBILIDAD_ESTADOS_NETWORK.map(estado => (
            <button
              key={estado}
              type="button"
              onClick={async () => {
                setAbierto(false);
                setGuardando(true);
                await actualizarDisponibilidad(estado);
                setGuardando(false);
              }}
              className="w-full text-left px-3 py-2 rounded-xl text-[13px] font-medium hover:opacity-70 transition-opacity flex items-center gap-2"
              style={{ color: NW_TINTA, background: estado === perfil.disponibilidadEstado ? '#F4F2EC' : 'transparent' }}
            >
              <span
                className="w-[7px] h-[7px] rounded-full shrink-0"
                style={{ background: estado === 'no_disponible' ? NW_MUTED_2 : NW_PRODUCTO }}
              />
              {DISPONIBILIDAD_ESTADO_LABEL[estado]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MenuAvatar({ nombre, fotoUrl }: { nombre: string; fotoUrl: string | null }) {
  const { signOut } = useAuth();
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    function fuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, [abierto]);

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setAbierto(v => !v)} aria-label="Cuenta">
        <AvatarCircular fotoUrl={fotoUrl} nombre={nombre} />
      </button>
      {abierto && (
        <div
          className="absolute right-0 top-[calc(100%+8px)] z-20 w-48 rounded-2xl p-1.5 bg-white"
          style={{ border: `1px solid ${NW_BORDE}`, boxShadow: '0 12px 32px rgba(20,20,15,.12)' }}
        >
          <button
            type="button"
            onClick={() => signOut()}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-[13px] font-semibold hover:opacity-70 transition-opacity"
            style={{ color: NW_TINTA }}
          >
            <LogOut size={14} /> Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}

function CabeceraAutoservicio({ pathname }: { pathname: string }) {
  const { perfil, solicitudesPendientesCount, vacantesQueEncajanCount, mensajesNoLeidosCount } = usePerfilNetwork();
  const badgeCampana = solicitudesPendientesCount + mensajesNoLeidosCount;

  return (
    <header className="border-b" style={{ borderColor: NW_BORDE, background: '#fff' }}>
      <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
        <Link href="/network/inicio" className="flex items-center gap-2.5 shrink-0">
          <LogoTentare formato="horizontal" producto="network" titulo="Tentare Network" alto={26} />
          <InsigniaBeta alto={26} />
        </Link>
        {perfil && (
          <div className="flex items-center gap-2.5 shrink-0">
            <SelectorDisponibilidad />
            <Link
              href="/network/solicitudes"
              aria-label="Notificaciones"
              className="relative inline-flex items-center justify-center w-9 h-9 rounded-full shrink-0"
              style={{ border: `1px solid ${NW_BORDE}` }}
            >
              <Bell size={15} style={{ color: NW_MUTED }} />
              {badgeCampana > 0 && (
                <span
                  className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                  style={{ background: NW_PRODUCTO }}
                >
                  {badgeCampana > 9 ? '9+' : badgeCampana}
                </span>
              )}
            </Link>
            <MenuAvatar nombre={perfil.nombre} fotoUrl={perfil.fotoUrl} />
          </div>
        )}
      </div>
      <nav className="max-w-3xl mx-auto px-4 pb-3 -mt-1 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1.5 min-w-max">
          {SUBNAV.map(({ href, label, badge }) => {
            const active = coincide(pathname, href);
            const contador = badge === 'oportunidades' ? vacantesQueEncajanCount
              : badge === 'solicitudes' ? solicitudesPendientesCount : 0;
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold whitespace-nowrap transition-colors',
                  active ? 'bg-white' : 'bg-transparent hover:opacity-70',
                )}
                style={active
                  ? { color: NW_TINTA, border: `1px solid ${NW_BORDE}`, boxShadow: '0 1px 2px rgba(20,20,15,.05)' }
                  : { color: NW_MUTED }}
              >
                {label}
                {contador > 0 && (
                  <span
                    className="min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                    style={{ background: NW_PRODUCTO }}
                  >
                    {contador > 9 ? '9+' : contador}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}

export default function NetworkLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // `lib/posthog-cliente.ts` existía en el repo sin un solo caller (auditoría
  // 2026-08-19) — este layout envuelve TODO /network, público y autoservicio,
  // así que es el único sitio que hace falta tocar para que la analítica de
  // conversión del embudo (instrumentada en BuscadorHero/FormularioInteresEstudio/
  // BotonContactar) llegue a algún sitio. `capture_pageview: true` ya cubre las
  // vistas de página sin nada más que hacer aquí.
  useEffect(() => { cargarCuandoOcioso(); }, []);

  if (!SUBNAV.some(s => coincide(pathname ?? '', s.href))) return <>{children}</>;

  return (
    <PerfilNetworkProvider>
      <div className="min-h-dvh" style={{ background: NW_FONDO }}>
        <CabeceraAutoservicio pathname={pathname ?? ''} />
        {/* Sin max-w aquí: Inicio necesita dos columnas anchas (mockup
            2026-09), pero mi-perfil/mis-mensajes/solicitudes YA se acotan
            a max-w-2xl por dentro (eran las que dependían del max-w-2xl que
            tenía este <main>) — oportunidades/mis-candidaturas ganan el
            mismo max-w-2xl propio para no estirarse a lo ancho sin motivo
            hasta que les toque su fase de rediseño. */}
        <main className="px-4 py-8">{children}</main>
      </div>
    </PerfilNetworkProvider>
  );
}
