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
import { usePathname } from 'next/navigation';
import { LogoTentare } from '@/components/marca/logo-tentare';
import { useAuth } from '@/lib/auth-context';

const RUTAS_AUTOSERVICIO = ['/network/mi-perfil', '/network/solicitudes', '/network/mis-mensajes'];

export default function NetworkLayout({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const pathname = usePathname();

  if (!RUTAS_AUTOSERVICIO.includes(pathname ?? '')) return <>{children}</>;

  return (
    <div className="min-h-dvh" style={{ background: '#EEEEE8' }}>
      <header className="border-b border-[#E7E7E0] bg-white">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/network/unirse" className="flex items-center">
            <LogoTentare formato="horizontal" producto="network" titulo="Tentare Network" alto={26} />
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
      </header>
      <main className="max-w-2xl mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
