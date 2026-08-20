'use client';

import { useEffect, useId } from 'react';
import { Check, Minus, ChevronDown } from 'lucide-react';
import { PLANES, PLAN_INFO, type Plan } from '@/lib/billing/entitlements';
import { CATEGORIAS, type ValorPlan } from '@/lib/billing/catalogo-planes';

// Comparativa completa por categorías. La usan /precios (pública), la hoja
// «ver todo lo que incluye» del alta y /suscripcion — una sola tabla, no tres
// listas escritas a mano que se van separando entre sí con el tiempo.
//
// Las categorías van en <details> nativos y no en un acordeón hecho a mano:
// el navegador ya trae el estado abierto/cerrado, el foco, el teclado y —lo que
// más importa aquí— la búsqueda en página (Ctrl+F encuentra texto dentro de un
// <details> cerrado y lo abre). Un div con `hidden` no hace ninguna de las
// cuatro cosas.

function Marca({ valor }: { valor: ValorPlan }) {
  if (valor.tipo === 'si') {
    return (
      <>
        <Check size={16} className="text-brand-medio" aria-hidden="true" />
        <span className="sr-only">Incluido</span>
      </>
    );
  }
  if (valor.tipo === 'no') {
    return (
      <>
        <Minus size={16} className="text-muted-foreground/50" aria-hidden="true" />
        <span className="sr-only">No incluido</span>
      </>
    );
  }
  return <span className="text-[13px] font-semibold text-foreground">{valor.texto}</span>;
}

export function ComparativaPlanes({
  /** Plan resaltado (el elegido en el alta, o el contratado en /suscripcion). */
  destacado,
  /** Abre todas las categorías de salida. /precios lo quiere así (es SEO). */
  todoAbierto = false,
}: {
  destacado?: Plan;
  todoAbierto?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      {/* Cabecera pegajosa con los tres planes. En móvil el contenedor de cada
          categoría hace scroll horizontal por su cuenta (ver .cmp-scroll), así
          que la columna del nombre se mantiene siempre visible. */}
      <div className="sticky top-0 z-10 grid grid-cols-[1fr_repeat(3,minmax(64px,88px))] items-end gap-2 border-b border-border bg-muted/70 px-4 py-3 backdrop-blur-sm sm:grid-cols-[1fr_repeat(3,minmax(88px,120px))] sm:px-5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Funcionalidad
        </span>
        {PLANES.map((p) => (
          <span
            key={p}
            className={`text-center text-[12px] font-bold sm:text-[13px] ${
              p === destacado ? 'text-brand-medio' : 'text-muted-foreground'
            }`}
          >
            {PLAN_INFO[p].nombre}
            <span className="block text-[10px] font-medium tabular-nums opacity-70">
              {PLAN_INFO[p].precioMes}€
            </span>
          </span>
        ))}
      </div>

      {CATEGORIAS.map((cat, i) => (
        <details
          key={cat.id}
          open={todoAbierto || i === 0}
          className="group border-b border-border last:border-0"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring sm:px-5 [&::-webkit-details-marker]:hidden">
            <span className="text-[14px] font-semibold text-foreground sm:text-[15px]">{cat.titulo}</span>
            <ChevronDown
              size={16}
              aria-hidden="true"
              className="shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
            />
          </summary>

          <div className="pb-1">
            {cat.filas.map((fila) => (
              <div
                key={fila.nombre}
                className="grid grid-cols-[1fr_repeat(3,minmax(64px,88px))] items-center gap-2 px-4 py-2.5 odd:bg-muted/25 sm:grid-cols-[1fr_repeat(3,minmax(88px,120px))] sm:px-5"
              >
                <div className="min-w-0 pr-2">
                  <div className="text-[13.5px] font-medium leading-snug text-foreground">{fila.nombre}</div>
                  {fila.detalle && (
                    <div className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{fila.detalle}</div>
                  )}
                </div>
                {PLANES.map((p) => (
                  <div key={p} className="flex items-center justify-center">
                    <Marca valor={fila.valor(p)} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}

/**
 * La comparativa dentro de una hoja modal. Es lo que abre «Ver todo lo que
 * incluye» desde el alta, donde la tabla entera no cabe sin enterrar el botón
 * de seguir.
 */
export function HojaComparativa({
  abierta,
  onCerrar,
  destacado,
}: {
  abierta: boolean;
  onCerrar: () => void;
  destacado?: Plan;
}) {
  const tituloId = useId();

  // Escape cierra. Va aquí y no en el <div>: un modal que solo se cierra
  // pulsando su botón obliga a encontrarlo, y el teclado es la vía de quien
  // navega sin ratón. El efecto se registra siempre (no puede ir tras el
  // early-return) y solo hace algo mientras está abierta.
  useEffect(() => {
    if (!abierta) return;
    const alPulsar = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); };
    document.addEventListener('keydown', alPulsar);
    return () => document.removeEventListener('keydown', alPulsar);
  }, [abierta, onCerrar]);

  if (!abierta) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 p-0 backdrop-blur-[2px] animate-sheet-backdrop-in sm:items-center sm:p-6"
      onClick={onCerrar}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl bg-background shadow-2xl animate-sheet-pop-in sm:rounded-3xl"
      >
        <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
          <h2 id={tituloId} className="text-[17px] font-bold text-foreground">
            Qué incluye cada plan
          </h2>
          <button
            type="button"
            onClick={onCerrar}
            autoFocus
            className="rounded-full px-3 py-1.5 text-[13px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Cerrar
          </button>
        </div>
        <div className="cmp-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5">
          <ComparativaPlanes destacado={destacado} todoAbierto />
        </div>
      </div>
    </div>
  );
}
