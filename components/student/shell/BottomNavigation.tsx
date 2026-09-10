'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEstudio } from '@/components/student/contexto';

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
// del calendario y de las chispas de la búsqueda. Cada uno lleva VARIOS
// trazados —el anterior era una `d` suelta por pestaña— así que se guardan como
// lista; el orden es el del fichero original, que importa cuando dos se pisan.
const TABS: Array<{ ruta: string; label: string; paths: string[] }> = [
  {
    ruta: '', label: 'Inicio',
    paths: ['M3 11.9896V14.5C3 17.7998 3 19.4497 4.02513 20.4749C5.05025 21.5 6.70017 21.5 10 21.5H14C17.2998 21.5 18.9497 21.5 19.9749 20.4749C21 19.4497 21 17.7998 21 14.5V11.9896C21 10.3083 21 9.46773 20.6441 8.74005C20.2882 8.01237 19.6247 7.49628 18.2976 6.46411L16.2976 4.90855C14.2331 3.30285 13.2009 2.5 12 2.5C10.7991 2.5 9.76689 3.30285 7.70242 4.90855L5.70241 6.46411C4.37533 7.49628 3.71179 8.01237 3.3559 8.74005C3 9.46773 3 10.3083 3 11.9896Z'],
  },
  {
    ruta: '/reservar', label: 'Reservar',
    paths: [
      'M16.0001 16.5L20 20.5',
      'M18 11.5C18 15.366 14.866 18.5 11 18.5C7.13401 18.5 4 15.366 4 11.5C4 7.63404 7.13401 4.50003 11 4.50003',
      'M15.5 3.50003L15.7579 4.19706C16.0961 5.11105 16.2652 5.56805 16.5986 5.90142C16.932 6.2348 17.389 6.4039 18.303 6.74211L19 7.00003L18.303 7.25795C17.389 7.59616 16.932 7.76527 16.5986 8.09864C16.2652 8.43201 16.0961 8.88901 15.7579 9.803L15.5 10.5L15.2421 9.803C14.9039 8.88901 14.7348 8.43201 14.4014 8.09864C14.068 7.76527 13.611 7.59616 12.697 7.25795L12 7.00003L12.697 6.74211C13.611 6.4039 14.068 6.2348 14.4014 5.90142C14.7348 5.56805 14.9039 5.11105 15.2421 4.19706L15.5 3.50003Z',
    ],
  },
  {
    ruta: '/mis-reservas', label: 'Mis clases',
    paths: [
      'M16 2V6M8 2V6',
      'M12 22H11C7.22876 22 5.34315 22 4.17157 20.8284C3 19.6569 3 17.7712 3 14V12C3 8.22876 3 6.34315 4.17157 5.17157C5.34315 4 7.22876 4 11 4H13C16.7712 4 18.6569 4 19.8284 5.17157C21 6.34315 21 8.22876 21 12V12.5',
      'M3 10H21',
      'M17 22C17 22 21 20.1471 21 17.1389C21 15.9576 20.1579 15 19 15C18.0526 15 17.4211 15.4118 17 16.2353C16.5789 15.4118 15.9474 15 15 15C13.8421 15 13 15.9576 13 17.1389C13 20.1471 17 22 17 22Z',
    ],
  },
  {
    ruta: '/bonos', label: 'Bonos',
    paths: [
      'M15 4H9C5.70017 4 4.05025 4 3.02513 5.02513C2 6.05025 2 7.70017 2 11V13C2 16.2998 2 17.9497 3.02513 18.9749C4.05025 20 5.70017 20 9 20H15C18.2998 20 19.9497 20 20.9749 18.9749C22 17.9497 22 16.2998 22 13V11C22 7.70017 22 6.05025 20.9749 5.02513C19.9497 4 18.2998 4 15 4Z',
      'M21.5 8H11.5L12.5 9.5H21.5V8Z',
      'M10 11.5C10 12.8807 8.88072 14 7.5 14C6.11928 14 5 12.8807 5 11.5C5 10.1193 6.11928 9 7.5 9C8.88072 9 10 10.1193 10 11.5Z',
    ],
  },
  {
    ruta: '/perfil', label: 'Perfil',
    paths: [
      'M20 21C20 18.7328 20 17.5992 19.5929 16.7097C19.1649 15.7746 18.4287 15.0144 17.5071 14.5558C16.6305 14.1196 15.5 14 13.2263 14.0051L10.7728 14C8.49999 14 7.39496 14.1069 6.52924 14.528C5.57859 14.9904 4.82688 15.7651 4.39412 16.7284C4.00001 17.6057 4.00001 18.7371 4 21',
      'M16 7C16 9.20914 14.2091 11 12 11C9.79086 11 8 9.20914 8 7C8 4.79086 9.79086 3 12 3C14.2091 3 16 4.79086 16 7Z',
    ],
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
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                {t.paths.map((d) => <path key={d} d={d} />)}
              </svg>
              <span style={{ fontSize: 'var(--t-micro)', fontWeight: 800 }}>{t.label}</span>
              {t.ruta === '/mis-reservas' && badgeReservas > 0 && (
                <span aria-hidden style={{ position: 'absolute', top: 2, right: 8, minWidth: 15, height: 15, borderRadius: 99, background: 'var(--accent)', color: '#fff', fontSize: 'var(--t-micro)', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', animation: 'apDot .4s both' }}>
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
