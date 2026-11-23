'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';

export interface EntradaContenido { titulo: string; href: string }

// El botón «Contenido» de la cabecera de una guía de Shopify: abre la lista de las guías hermanas (las de su misma categoría) con la
// actual marcada, para saltar sin volver atrás.
export function AyudaContenidoMenu({ categoria, entradas, actual }: { categoria: string; entradas: EntradaContenido[]; actual: string }) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => { if (!caja.current?.contains(e.target as Node)) setAbierto(false); };
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('mousedown', fuera); document.addEventListener('keydown', tecla);
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', tecla); };
  }, [abierto]);
  return (
    <div className="ay-contenido-menu" ref={caja}>
      <button type="button" className="ay-contenido-boton" aria-expanded={abierto} aria-haspopup="true" onClick={() => setAbierto((v) => !v)}>
        Contenido <ChevronDown size={14} aria-hidden="true" />
      </button>
      {abierto && (
        <div className="ay-contenido-panel">
          <p>{categoria}</p>
          <ul>
            {entradas.map((e) => (
              <li key={e.href}>
                <Link href={e.href} aria-current={e.href === actual ? 'page' : undefined} onClick={() => setAbierto(false)}>{e.titulo}</Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
