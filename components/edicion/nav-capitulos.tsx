'use client';

import { useEffect, useState } from 'react';
import { Menu } from 'lucide-react';

// La barra flotante de abajo de las Editions: dice en qué capítulo estás y abre la lista para saltar a otro.
export function NavCapitulos({ capitulos }: { capitulos: { id: string; nombre: string }[] }) {
  const [activo, setActivo] = useState(capitulos[0]?.id ?? '');
  const [abierta, setAbierta] = useState(false);

  useEffect(() => {
    const io = new IntersectionObserver((es) => {
      for (const e of es) if (e.isIntersecting) setActivo(e.target.id);
    }, { rootMargin: '-45% 0px -50% 0px' });
    for (const c of capitulos) { const el = document.getElementById(c.id); if (el) io.observe(el); }
    return () => io.disconnect();
  }, [capitulos]);

  const nombre = capitulos.find((c) => c.id === activo)?.nombre ?? capitulos[0]?.nombre;
  return (
    <nav className="ed-nav" aria-label="Capítulos de la edición">
      {abierta && (
        <ul className="ed-nav-lista">
          {capitulos.map((c) => (
            <li key={c.id}>
              <a href={`#${c.id}`} aria-current={c.id === activo ? 'true' : undefined} onClick={() => setAbierta(false)}>{c.nombre}</a>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="ed-nav-boton" aria-expanded={abierta} onClick={() => setAbierta((v) => !v)}>
        <span>{nombre}</span><Menu size={15} aria-hidden="true" />
      </button>
    </nav>
  );
}
