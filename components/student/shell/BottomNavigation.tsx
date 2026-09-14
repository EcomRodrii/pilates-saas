'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEstudio } from '@/components/student/contexto';
import { Icono, type NombreIcono } from '@/components/student/ui/Icono';

// Nav inferior. Del paquete (`components/shell/BottomNavigation.tsx`): mismos
// cinco destinos, mismas etiquetas.
//
// Lo que cambia: las rutas llevan el prefijo `/portal/<slug>`, así que la
// comparación de «pestaña activa» se hace sobre el sufijo, no sobre el path
// completo.
//
// ⚠️ Los iconos son los del set que eligió el fundador (HugeIcons
// stroke-rounded), y por eso el trazo va a **1.5**, no a 2: están dibujados a
// ese grosor sobre un lienzo de 24, y engordarlos cierra los huecos del corazón
// del calendario y de las chispas de la búsqueda. Los trazados viven en
// `ui/Icono.tsx`, con los del resto de la app.
const TABS: Array<{ ruta: string; label: string; icono: NombreIcono }> = [
  {
    ruta: '', label: 'Inicio',
    icono: 'inicio',
  },
  {
    ruta: '/reservar', label: 'Reservar',
    icono: 'reservar',
  },
  {
    ruta: '/mis-reservas', label: 'Mis clases',
    icono: 'mis-clases',
  },
  {
    ruta: '/bonos', label: 'Bonos',
    icono: 'bono',
  },
  {
    ruta: '/perfil', label: 'Perfil',
    icono: 'perfil',
  },
];

export function BottomNavigation({ badgeReservas = 0 }: { badgeReservas?: number }) {
  const path = usePathname();
  const { slug } = useEstudio();
  const base = `/portal/${encodeURIComponent(slug)}`;

  return (
    <nav
      aria-label="Principal"
      style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 40, background: 'rgba(250,249,245,.88)', backdropFilter: 'blur(16px)', borderTop: '1px solid var(--muted)', paddingBottom: 'var(--safe-bottom)' }}
    >
      <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', justifyContent: 'space-around', alignItems: 'center', padding: '9px 8px 10px' }}>
        {TABS.map((t) => {
          const destino = base + t.ruta;
          // Inicio solo se ilumina en la raíz exacta; el resto, también en sus
          // subrutas (`/reservar/c1` mantiene «Reservar» activa).
          const on = t.ruta === '' ? path === base : path.startsWith(destino);
          return (
            <Link
              key={t.ruta || 'inicio'}
              href={destino}
              aria-current={on ? 'page' : undefined}
              style={{ position: 'relative', minWidth: 56, minHeight: 48, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, color: on ? 'var(--foreground)' : 'var(--subtle-foreground)', transition: 'color .2s' }}
            >
              <Icono nombre={t.icono} tamano={22} />
              <span style={{ fontSize: 'var(--t-micro)', fontWeight: 800 }}>{t.label}</span>
              {t.ruta === '/mis-reservas' && badgeReservas > 0 && (
                <span aria-hidden style={{ position: 'absolute', top: 2, right: 8, minWidth: 15, height: 15, borderRadius: 99, background: 'var(--accent)', color: 'var(--accent-foreground)', fontSize: 'var(--t-micro)', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', animation: 'apDot .4s both' }}>
                  {badgeReservas}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
