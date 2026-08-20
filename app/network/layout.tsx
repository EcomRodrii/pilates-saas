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
import Link from 'next/link';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { LogoTentare } from '@/components/marca/logo-tentare';
import { InsigniaBeta } from '@/components/network-v2/InsigniaBeta';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';
import { cargarCuandoOcioso } from '@/lib/posthog-cliente';

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
  { href: '/network/inicio', label: 'Inicio' },
  { href: '/network/mi-perfil', label: 'Mi perfil' },
  { href: '/network/oportunidades', label: 'Oportunidades' },
  { href: '/network/mis-candidaturas', label: 'Mis candidaturas' },
  { href: '/network/mis-mensajes', label: 'Mensajes' },
  { href: '/network/solicitudes', label: 'Solicitudes' },
];

function coincide(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function NetworkLayout({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
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
    <div className="min-h-dvh" style={{ background: '#EEEEE8' }}>
      <header className="border-b border-[#E7E7E0] bg-white">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/network/inicio" className="flex items-center gap-2.5">
            <LogoTentare formato="horizontal" producto="network" titulo="Tentare Network" alto={26} />
            <InsigniaBeta alto={26} />
          </Link>
          {user && (
            <button
              onClick={() => signOut()}
              className="text-[12px] text-[#8E8E86] hover:text-[#3A3A34] transition-colors"
            >
              Cerrar sesión
            </button>
          )}
        </div>
        <nav className="max-w-2xl mx-auto px-4 pb-3 -mt-1 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-1.5 min-w-max">
            {SUBNAV.map(({ href, label }) => {
              const active = coincide(pathname ?? '', href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'inline-flex items-center rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold whitespace-nowrap transition-colors',
                    active
                      ? 'bg-[#1A1A1A] text-white'
                      : 'bg-transparent border border-[#E7E7E0] text-[#6C6C64] hover:text-[#1A1A1A] hover:border-[#C9C9BE]',
                  )}
                >
                  {label}
                </Link>
              );
            })}
          </div>
        </nav>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
