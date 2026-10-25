'use client';

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

// Pestañas accesibles (patrón WAI-ARIA «tabs» con activación automática): las
// flechas mueven el foco y la selección, Inicio y Fin van a la primera y la
// última, y solo la pestaña activa está en el orden de tabulación. Los paneles
// llegan ya pintados desde el servidor y están TODOS en el HTML (los inactivos
// con `hidden`): el buscador y quien entra sin JavaScript leen todo el contenido.
// Lo único que vive en el cliente es qué pestaña está abierta.

export interface Pestana {
  id: string;
  etiqueta: string;
  panel: ReactNode;
}

export function PestanasCliente({ pestanas, etiqueta }: { pestanas: readonly Pestana[]; etiqueta: string }) {
  const [activa, setActiva] = useState(0);
  // El panel solo se anima tras el primer gesto: el que viene abierto no «entra» al cargar la página.
  const [tocado, setTocado] = useState(false);
  const base = useId();
  const botones = useRef<(HTMLButtonElement | null)[]>([]);

  function ir(i: number) {
    const n = (i + pestanas.length) % pestanas.length;
    setTocado(true);
    setActiva(n);
    botones.current[n]?.focus();
  }

  function alTeclear(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const mapa: Record<string, number> = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: pestanas.length - 1 };
    if (!(e.key in mapa)) return;
    e.preventDefault();
    ir(mapa[e.key]);
  }

  return (
    <div className={tocado ? 'wh-tabs wh-tabs-vivo' : 'wh-tabs'}>
      <div role="tablist" aria-label={etiqueta} className="wh-tabs-lista">
        {pestanas.map((p, i) => (
          <button
            key={p.id}
            ref={(el) => { botones.current[i] = el; }}
            type="button"
            role="tab"
            id={`${base}-tab-${p.id}`}
            aria-controls={`${base}-panel-${p.id}`}
            aria-selected={i === activa}
            tabIndex={i === activa ? 0 : -1}
            className="wh-tab"
            onClick={() => { setTocado(true); setActiva(i); }}
            onKeyDown={(e) => alTeclear(e, i)}
          >
            {p.etiqueta}
          </button>
        ))}
      </div>
      {pestanas.map((p, i) => (
        <div
          key={p.id}
          role="tabpanel"
          id={`${base}-panel-${p.id}`}
          aria-labelledby={`${base}-tab-${p.id}`}
          hidden={i !== activa}
          tabIndex={0}
          className="wh-tabpanel"
        >
          {p.panel}
        </div>
      ))}
    </div>
  );
}
