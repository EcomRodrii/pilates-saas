'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEstudio } from '@/components/student/contexto';

// Nav inferior. Del paquete (`components/shell/BottomNavigation.tsx`): mismos
// cinco destinos, mismos paths de icono, mismos 9,5px/800 de etiqueta.
//
// Lo que cambia: las rutas llevan el prefijo `/portal/<slug>`, así que la
// comparación de «pestaña activa» se hace sobre el sufijo, no sobre el path
// completo.
const TABS = [
  { ruta: '', label: 'Inicio', d: 'M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5' },
  { ruta: '/reservar', label: 'Reservar', d: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM16.5 16.5 21 21' },
  { ruta: '/mis-reservas', label: 'Mis clases', d: 'M3 5h18v16H3zM3 10h18M8 3v4M16 3v4' },
  { ruta: '/bonos', label: 'Bonos', d: 'M3 7h18v10H3zM3 11h18M7 15h3' },
  { ruta: '/perfil', label: 'Perfil', d: 'M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4 21c1.5-4 4.5-6 8-6s6.5 2 8 6' },
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
              <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d={t.d} />
              </svg>
              <span style={{ fontSize: 9.5, fontWeight: 800 }}>{t.label}</span>
              {t.ruta === '/mis-reservas' && badgeReservas > 0 && (
                <span aria-hidden style={{ position: 'absolute', top: 2, right: 8, minWidth: 15, height: 15, borderRadius: 99, background: 'var(--accent)', color: '#fff', fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', animation: 'apDot .4s both' }}>
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
