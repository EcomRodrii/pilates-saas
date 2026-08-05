'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Search, Check } from 'lucide-react';

// El selector de página de la barra superior, como el del editor de Shopify:
// el nombre de lo que estás mirando, y al pulsarlo una lista con buscador
// para saltar a otra.
//
// Dos decisiones de contenido, ambas para no mentir:
//
//  · **Solo entran las páginas que el preview sabe enseñar.** El portal tiene
//    ~16 pantallas; el iframe solo sirve cinco. Un ítem que lleva a una caja
//    gris es peor que no tenerlo, así que las demás no aparecen.
//  · **La píldora "secciones" distingue las tres que se pueden construir.**
//    Reservas y Perfil se pueden mirar pero no tienen bloques que añadir, y
//    sin ese aviso la propietaria las abriría esperando poder editarlas.

export interface OpcionPagina {
  id: string;
  etiqueta: string;
  /** Si tiene constructor de bloques (Inicio/Clases/Bonos). */
  conSecciones: boolean;
  /** Rótulo del grupo en la lista. */
  grupo: string;
}

export function SelectorPagina({
  opciones, activa, onElegir,
}: {
  opciones: readonly OpcionPagina[];
  activa: string;
  onElegir: (id: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const contenedor = useRef<HTMLDivElement>(null);

  function cerrar() {
    setAbierto(false);
    setBusqueda('');
  }

  // Cerrar al clicar fuera o con Escape. `mousedown` y no `click` para que
  // cerrar no dispare de paso lo que hubiera debajo.
  useEffect(() => {
    if (!abierto) return;
    function fuera(e: MouseEvent) {
      if (contenedor.current && !contenedor.current.contains(e.target as Node)) cerrar();
    }
    function escape(e: KeyboardEvent) {
      if (e.key === 'Escape') cerrar();
    }
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', escape);
    };
  }, [abierto]);

  const actual = opciones.find((o) => o.id === activa);
  const filtradas = opciones.filter((o) =>
    o.etiqueta.toLocaleLowerCase('es').includes(busqueda.trim().toLocaleLowerCase('es')),
  );
  const grupos = [...new Set(filtradas.map((o) => o.grupo))];

  return (
    <div ref={contenedor} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-haspopup="listbox"
        className="flex items-center gap-1.5 max-w-full px-2.5 py-1.5 rounded-lg text-[13px] font-semibold text-foreground hover:bg-muted"
      >
        <span className="truncate">{actual?.etiqueta ?? 'Elegir página'}</span>
        <ChevronDown size={14} className="flex-none text-muted-foreground" />
      </button>

      {abierto && (
        <div
          role="listbox"
          aria-label="Página del portal"
          className="absolute left-1/2 -translate-x-1/2 top-full mt-1.5 w-72 max-h-[60vh] overflow-y-auto rounded-xl border border-border bg-card shadow-lg z-50 p-1.5"
        >
          <div className="flex items-center gap-2 px-2 py-1.5 mb-1 rounded-lg bg-muted">
            <Search size={14} className="flex-none text-muted-foreground" />
            <input
              // El popover se monta al abrir, así que `autoFocus` es
              // literalmente "al abrir": quien pulsa el selector quiere llegar
              // a otra página, y teclear es más rápido que apuntar.
              autoFocus
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar página"
              aria-label="Buscar página"
              className="w-full bg-transparent text-[13px] outline-none"
            />
          </div>

          {filtradas.length === 0 && (
            <p className="px-2.5 py-3 text-[12.5px] text-muted-foreground">No hay ninguna página con ese nombre.</p>
          )}

          {grupos.map((grupo) => (
            <div key={grupo} className="mb-1 last:mb-0">
              <p className="px-2.5 pt-1.5 pb-1 text-[10.5px] font-bold text-muted-foreground uppercase tracking-widest">{grupo}</p>
              {filtradas.filter((o) => o.grupo === grupo).map((o) => (
                <button
                  key={o.id}
                  type="button"
                  role="option"
                  aria-selected={o.id === activa}
                  onClick={() => { onElegir(o.id); cerrar(); }}
                  className={`w-full flex items-center gap-2 text-left px-2.5 py-2 rounded-lg text-[13px] ${
                    o.id === activa ? 'bg-brand/10 font-semibold text-foreground' : 'text-foreground hover:bg-muted'
                  }`}
                >
                  <span className="flex-1 truncate">{o.etiqueta}</span>
                  {o.conSecciones && (
                    <span className="flex-none text-[10px] font-bold uppercase tracking-wide text-muted-foreground border border-border rounded px-1 py-0.5">
                      secciones
                    </span>
                  )}
                  {o.id === activa && <Check size={14} className="flex-none text-brand-medio" />}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
