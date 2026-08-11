'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';

// El menú "…" de la barra superior, como el del editor de Shopify.
//
// Nace de un problema medido, no de copiar un icono: la barra tenía DOCE
// controles seguidos —estado, tres dispositivos, tres de zoom, dos de modo de
// clic, deshacer, rehacer, descartar, guardar y publicar— y en esa fila
// «Descartar cambios», que tira el trabajo de una sección entera, quedaba del
// mismo tamaño y peso que «Alejar». Lo que se usa cada minuto (dispositivo,
// deshacer, publicar) tiene que estar a la vista; lo que se usa una vez por
// sesión, y sobre todo lo que destruye, va dentro.
//
// `children` recibe `cerrar` en vez de cerrarse solo al pulsar: los controles
// que se ajustan a ojo (el zoom, el modo de clic) se usan varias veces
// seguidas mirando el lienzo, y un menú que se cierra en cada clic obliga a
// reabrirlo cada vez. Los que abren un diálogo sí llaman a `cerrar`.

export function MenuMas({
  etiqueta = 'Más opciones',
  children,
}: {
  etiqueta?: string;
  children: (cerrar: () => void) => ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);

  // Mismo patrón que SelectorPagina: `mousedown` y no `click`, para que el
  // gesto de cerrar no dispare de paso lo que hubiera debajo.
  useEffect(() => {
    if (!abierto) return;
    function fuera(e: MouseEvent) {
      if (contenedor.current && !contenedor.current.contains(e.target as Node)) setAbierto(false);
    }
    function escape(e: KeyboardEvent) {
      if (e.key === 'Escape') setAbierto(false);
    }
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', escape);
    };
  }, [abierto]);

  return (
    <div ref={contenedor} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-haspopup="menu"
        aria-label={etiqueta}
        title={etiqueta}
        className={`p-1.5 rounded-lg ${abierto ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
      >
        <MoreHorizontal size={17} />
      </button>

      {abierto && (
        <div
          role="menu"
          aria-label={etiqueta}
          className="absolute right-0 top-full mt-1.5 w-64 rounded-xl border border-border bg-card shadow-lg z-50 p-1.5"
        >
          {children(() => setAbierto(false))}
        </div>
      )}
    </div>
  );
}

/** Un rótulo de grupo dentro del menú. */
export function MenuGrupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="px-1 py-1.5">
      <p className="px-1.5 pb-1.5 text-[10.5px] font-bold text-muted-foreground uppercase tracking-widest">{titulo}</p>
      {children}
    </div>
  );
}
