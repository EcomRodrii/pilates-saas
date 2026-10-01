'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X } from 'lucide-react';
import { cn, horaEstudio } from '@/lib/utils';
import { anfitrionPortal } from '@/lib/panel-portal';
import { buscarSesiones, type SesionBuscable } from '@/lib/calendario-busqueda';

// «Buscar» del Calendario: un solo sitio para las dos búsquedas que había.
//
// Antes había un campo «Buscar clase…» que filtraba lo que se ve y, aparte, una
// lupa que buscaba en todo el estudio para saltar a una clase. Dos búsquedas con
// el mismo icono. Aquí lo que se escribe hace las dos cosas: atenúa en la
// rejilla lo que no coincide y lista las clases que coinciden en cualquier
// fecha, para ir a una. Cerrado con algo escrito, el botón lo dice y se borra
// con la ×.

const fmtDia = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: 'Europe/Madrid' });

export function BuscadorCalendario({ candidatas, texto, onTexto, onSeleccionar, compacto }: {
  candidatas: SesionBuscable[];
  texto: string;
  onTexto: (t: string) => void;
  onSeleccionar: (id: string) => void;
  /** Solo el icono (ventanas estrechas); el nombre va en el title. */
  compacto?: boolean;
}) {
  const botonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const abierto = pos !== null;

  function abrir() {
    const r = botonRef.current?.getBoundingClientRect();
    if (!r) return;
    const ancho = Math.min(320, window.innerWidth - 16);
    setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - ancho - 8)) });
  }

  useEffect(() => {
    if (!abierto) return;
    function fuera(e: MouseEvent) {
      const t = e.target as Node;
      if (!botonRef.current?.contains(t) && !panelRef.current?.contains(t)) setPos(null);
    }
    // Esc cierra esto y nada más (ni un cajón de debajo ni la vista ampliada): en captura, sin propagarse.
    function tecla(e: KeyboardEvent) { if (e.key === 'Escape') { e.stopPropagation(); setPos(null); botonRef.current?.focus(); } }
    function cerrar() { setPos(null); }
    document.addEventListener('mousedown', fuera);
    window.addEventListener('keydown', tecla, true);
    window.addEventListener('resize', cerrar);
    return () => {
      document.removeEventListener('mousedown', fuera);
      window.removeEventListener('keydown', tecla, true);
      window.removeEventListener('resize', cerrar);
    };
  }, [abierto]);

  const resultados = abierto && texto.trim() ? buscarSesiones(candidatas, texto, new Date()) : [];
  const buscando = texto.trim().length > 0;

  return (
    <>
      <span className={cn('inline-flex min-h-11 items-center rounded-lg border bg-card text-[13px] font-medium md:min-h-9',
        buscando ? 'border-foreground/40' : 'border-border')}>
        <button
          ref={botonRef}
          type="button"
          onClick={() => (abierto ? setPos(null) : abrir())}
          aria-expanded={abierto}
          aria-label={buscando ? `Buscando «${texto.trim()}»` : 'Buscar clase'}
          title="Buscar una clase por su nombre, sala o instructora"
          className={cn('inline-flex min-h-11 items-center gap-1.5 text-foreground md:min-h-9', compacto && !buscando ? 'w-11 justify-center md:w-9' : 'pl-3', buscando ? 'pr-1' : compacto ? '' : 'pr-3')}
        >
          <Search size={15} className="shrink-0 text-muted-foreground" aria-hidden />
          {buscando ? <span className="max-w-[9rem] truncate">«{texto.trim()}»</span> : !compacto && 'Buscar'}
        </button>
        {buscando && (
          <button
            type="button"
            onClick={() => onTexto('')}
            aria-label="Dejar de buscar"
            className="mr-1 flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X size={14} />
          </button>
        )}
      </span>
      {pos && createPortal(
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Buscar clase"
          style={{ position: 'fixed', top: pos.top, left: pos.left }}
          className="z-50 w-80 max-w-[calc(100vw-16px)] overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg menu-pop-in"
        >
          <label className="flex items-center gap-2 border-b border-border px-3.5">
            <Search size={15} className="shrink-0 text-muted-foreground" aria-hidden />
            <input
              autoFocus
              value={texto}
              onChange={e => onTexto(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') setPos(null); }}
              placeholder="Clase, sala o instructora…"
              aria-label="Buscar clase"
              className="min-w-0 flex-1 bg-transparent py-2.5 text-base font-medium text-foreground placeholder:text-muted-foreground focus:outline-none pointer-fine:text-sm"
            />
          </label>
          {!buscando ? (
            <p className="px-3.5 py-3 text-[12.5px] text-muted-foreground text-pretty">
              Lo que escribas se resalta en el calendario, y aquí salen las clases que coinciden en cualquier fecha.
            </p>
          ) : (
            <div className="max-h-72 overflow-y-auto" data-testid="buscador-resultados">
              {resultados.length === 0 ? (
                <p className="px-3.5 py-3 text-[12.5px] text-muted-foreground">Ninguna clase coincide.</p>
              ) : resultados.map(r => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => { setPos(null); onTexto(''); onSeleccionar(r.id); }}
                  className="flex w-full flex-col items-start gap-0.5 px-3.5 py-2.5 text-left transition-colors hover:bg-muted"
                >
                  <span className="text-[13.5px] font-semibold text-foreground">{r.tipoClaseNombre}</span>
                  <span className="text-[12px] text-muted-foreground">
                    {fmtDia.format(new Date(r.inicio))} · {horaEstudio(r.inicio)} · {r.salaNombre} · {r.instructorNombre}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>,
        anfitrionPortal(),
      )}
    </>
  );
}
