'use client';

import { useEffect, useRef, useState } from 'react';
import { Columns3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { COLUMNAS_EXTRA, type ColumnaExtra } from '@/lib/clientas/columnas';

/** El ancho del panel (`w-56`). */
const ANCHO_PANEL = 224;

// «Columnas» de la tabla de Clientas (P2.8): solo en pantallas anchas (la lista
// del móvil no es una tabla). Un <details> nativo: se abre y se cierra con el
// teclado sin nada más, y las casillas son casillas de verdad. Lo que el nativo
// no hace —cerrarse al pinchar fuera, con Esc o al salir con el tabulador— va
// aquí. Cambia la vista, no filtra: por eso no se pinta como un filtro puesto.
export function SelectorColumnas({ elegidas, onCambiar }: {
  elegidas: readonly ColumnaExtra[];
  onCambiar: (columnas: ColumnaExtra[]) => void;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  // Hacia qué lado se abre: el botón cae a la izquierda o a la derecha según
  // cuánto se parta la fila de filtros (en un iPad, a la izquierda), y anclado
  // siempre a la derecha se salía de la pantalla. Se mide al pulsar, ANTES de
  // abrirse, para que no salte de un lado a otro.
  const [haciaIzquierda, setHaciaIzquierda] = useState(true);
  const medir = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setHaciaIzquierda(r.right - ANCHO_PANEL >= 8);
  };
  useEffect(() => {
    const fuera = (e: PointerEvent) => {
      const el = ref.current;
      if (el?.open && !el.contains(e.target as Node)) el.open = false;
    };
    // En captura y cortando la propagación (como `MenuAcciones`): Esc cierra el
    // panel y nada más. Sin esto, con una clienta abierta al lado, la página lo
    // oía también y la cerraba.
    const tecla = (e: KeyboardEvent) => {
      const el = ref.current;
      if (e.key !== 'Escape' || !el?.open) return;
      e.stopPropagation();
      el.open = false;
      el.querySelector('summary')?.focus();
    };
    document.addEventListener('pointerdown', fuera);
    window.addEventListener('keydown', tecla, true);
    return () => {
      document.removeEventListener('pointerdown', fuera);
      window.removeEventListener('keydown', tecla, true);
    };
  }, []);
  const marcar = (id: ColumnaExtra, si: boolean) => {
    const otras = new Set(elegidas);
    if (si) otras.add(id); else otras.delete(id);
    onCambiar(COLUMNAS_EXTRA.map(c => c.id).filter(c => otras.has(c)));
  };
  return (
    <details
      ref={ref}
      // Salir con el tabulador lo cierra. Solo si el foco va a OTRO sitio: en
      // Safari pinchar una casilla no le da el foco (relatedTarget nulo).
      onBlur={e => { if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget as Node)) e.currentTarget.open = false; }}
      className="relative hidden shrink-0 md:block"
      data-testid="selector-columnas"
    >
      <summary
        onClick={medir}
        className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-[13px] font-medium text-foreground outline-none transition-colors hover:border-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50 [@media(pointer:fine)]:min-h-9 [&::-webkit-details-marker]:hidden"
      >
        <Columns3 size={15} aria-hidden className="text-muted-foreground" />
        Columnas
        {elegidas.length > 0 && (
          <span className="rounded-full bg-foreground px-1.5 text-[11.5px] tabular-nums text-background">
            {elegidas.length}<span className="sr-only"> extra a la vista</span>
          </span>
        )}
      </summary>
      <fieldset className={cn('absolute z-20 mt-1 w-56 min-w-0 rounded-xl border border-border bg-popover p-2 shadow-lg', haciaIzquierda ? 'right-0' : 'left-0')}>
        <legend className="sr-only">Columnas que se ven en la tabla</legend>
        {COLUMNAS_EXTRA.map(c => (
          <label key={c.id} className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-2 text-[13px] text-foreground hover:bg-muted [@media(pointer:fine)]:min-h-9">
            <input type="checkbox" className="size-4 accent-[var(--foreground)] dark:[color-scheme:dark]"
              checked={elegidas.includes(c.id)} onChange={e => marcar(c.id, e.target.checked)} />
            {c.titulo}
          </label>
        ))}
        <p className="mt-1 px-2 text-[11.5px] text-muted-foreground">Se guarda en este navegador, solo para ti.</p>
      </fieldset>
    </details>
  );
}
