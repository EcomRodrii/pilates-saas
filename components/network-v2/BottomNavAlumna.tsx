'use client';

// Barra inferior fija SOLO para /network/alumna/inicio (F4, docs/tentare-os.md)
// — la única pantalla logueada de autoservicio de alumna hoy. No toca
// NavPublico/MarketplaceLayout (compartido con instructoras/visitantes) ni
// /network/alumna/reanudar (pantalla de tránsito, no de uso continuado).
// Complementa a HeaderAlumna (logo arriba), no lo sustituye: header con
// marca arriba, navegación tipo app abajo — patrón común en apps móviles.
//
// Deliberadamente sin gestos (swipe, pull-to-refresh) — descartado en el
// diseño de F4. Tres destinos, sin ruta nueva para ninguno:
//  · Inicio → esta misma pantalla (siempre activo, es la única que existe).
//  · Descubrir → /network/instructoras, la puerta de entrada más simple al
//    directorio (desde ahí también se llega a Estudios); un cuarto botón
//    solo para Estudios habría sido forzar contenido donde no lo hay.
//  · Favoritos → sin ruta nueva: ancla y hace scroll a la sección "Mis
//    favoritos" que ya vive dentro de esta misma page.tsx.
import { Home, Compass, Heart } from 'lucide-react';
import Link from 'next/link';
import { NW_BORDE, NW_MUTED, NW_PRODUCTO } from './tokens';

const ID_FAVORITOS = 'mis-favoritos';

function irAFavoritos(e: React.MouseEvent) {
  e.preventDefault();
  document.getElementById(ID_FAVORITOS)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function BottomNavAlumna() {
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 bg-white"
      style={{ borderTop: `1px solid ${NW_BORDE}`, paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Navegación de Tentare Network"
    >
      <div className="max-w-2xl mx-auto grid grid-cols-3">
        <Link
          href="/network/alumna/inicio"
          className="flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold"
          style={{ color: NW_PRODUCTO }}
          aria-current="page"
        >
          <Home size={20} />
          Inicio
        </Link>
        <Link
          href="/network/instructoras"
          className="flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium"
          style={{ color: NW_MUTED }}
        >
          <Compass size={20} />
          Descubrir
        </Link>
        <a
          href={`#${ID_FAVORITOS}`}
          onClick={irAFavoritos}
          className="flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium"
          style={{ color: NW_MUTED }}
        >
          <Heart size={20} />
          Favoritos
        </a>
      </div>
    </nav>
  );
}
