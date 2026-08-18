'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { NW_TINTA, NW_BORDE, NW_FONDO } from './tokens';

// Drawer del menú público en móvil — mismo patrón que HojaFiltrosMovil.tsx
// (bottom sheet, role="dialog", backdrop clicable). Antes "Explorar
// instructoras"/"Cómo funciona"/"Entrar como estudio" llevaban hidden
// md:flex/hidden sm:inline: por debajo de esos breakpoints no se apretaban,
// desaparecían del todo — inalcanzables desde el header en cualquier
// pantalla pública (auditoría mobile-first, 2026-08-18). NavPublico sigue
// siendo Server Component; esto es la única isla cliente que necesita.
export function MenuMovil() {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label="Abrir menú"
        className="md:hidden flex items-center justify-center w-11 h-11"
        style={{ color: NW_TINTA }}
      >
        <Menu size={22} />
      </button>

      {abierto && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Menú">
          <div className="absolute inset-0 bg-black/40" onClick={() => setAbierto(false)} />
          <div className="absolute inset-x-0 top-0 rounded-b-[26px] p-5 pb-8" style={{ background: NW_FONDO }}>
            <div className="flex items-center justify-between mb-5">
              <p className="text-[15px] font-extrabold" style={{ color: NW_TINTA }}>Menú</p>
              <button onClick={() => setAbierto(false)} aria-label="Cerrar" className="flex items-center justify-center w-11 h-11 -mr-2.5">
                <X size={20} color={NW_TINTA} />
              </button>
            </div>
            <nav className="flex flex-col" style={{ color: NW_TINTA }}>
              <Link
                href="/network/instructoras"
                onClick={() => setAbierto(false)}
                className="py-3.5 text-[15px] font-semibold"
                style={{ borderBottom: `1px solid ${NW_BORDE}` }}
              >
                Explorar instructoras
              </Link>
              <Link
                href="/network#como-funciona"
                onClick={() => setAbierto(false)}
                className="py-3.5 text-[15px] font-semibold"
                style={{ borderBottom: `1px solid ${NW_BORDE}` }}
              >
                Cómo funciona
              </Link>
              <Link
                href="/network/acceso"
                onClick={() => setAbierto(false)}
                className="py-3.5 text-[15px] font-semibold"
                style={{ borderBottom: `1px solid ${NW_BORDE}` }}
              >
                Entrar como estudio
              </Link>
              {/* El header oculta "Iniciar sesión" por debajo de sm (no
                  cabía junto al pill "Crear perfil" y este botón) — se
                  queda alcanzable aquí en un toque. */}
              <Link
                href="/network/acceso"
                onClick={() => setAbierto(false)}
                className="py-3.5 text-[15px] font-semibold"
              >
                Iniciar sesión
              </Link>
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
