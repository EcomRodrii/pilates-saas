'use client';

import { useEffect, useId, type ReactNode } from 'react';
import { Check, Minus, ChevronDown } from 'lucide-react';
import { PLANES, PLAN_INFO, type Plan } from '@/lib/billing/entitlements';
import { CATEGORIAS, FILA_TOPE_ALUMNAS, valorFoundingGratis, type FilaPlan, type ValorPlan } from '@/lib/billing/catalogo-planes';
import { ENTITLEMENTS_FOUNDING_GRATIS, GRATIS_RESERVAS_MES, LIMITES_GRATIS, SI_PASAS } from '@/lib/landing/founding-gratis';
import { NombrePlan } from '@/components/planes/nombre-plan';

// Comparativa completa por categorías. La usan /precios (pública), la hoja
// «ver todo lo que incluye» del alta y /suscripcion — una sola tabla, no tres
// listas escritas a mano que se van separando entre sí con el tiempo.
//
// Las categorías van en <details> nativos y no en un acordeón hecho a mano:
// el navegador ya trae el estado abierto/cerrado, el foco, el teclado y —lo que
// más importa aquí— la búsqueda en página (Ctrl+F encuentra texto dentro de un
// <details> cerrado y lo abre). Un div con `hidden` no hace ninguna de las
// cuatro cosas.

/** Las columnas de la cabecera y de cada fila: la misma rejilla en las dos. */
const COLUMNAS =
  'grid grid-cols-3 gap-x-2 px-4 sm:grid-cols-[minmax(180px,1fr)_repeat(3,minmax(96px,124px))] sm:px-5';

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
  /** Founding Studio GRATIS (web comercial, decisión del 15-oct-2026): su
   *  columna enseña todo menos varias sedes, «Gratis» en vez del precio y la
   *  fila de reservas al mes, que solo tiene tope en ese plan. */
  foundingGratis = false,
  acciones,
}: {
  destacado?: Plan;
  todoAbierto?: boolean;
  foundingGratis?: boolean;
  /** Lo que va bajo el nombre de cada plan en la cabecera: el botón, en /precios.
   *  Elementos y no una función: /precios es de servidor y esto es de cliente. */
  acciones?: Partial<Record<Plan, ReactNode>>;
}) {
  const valorDe = (fila: FilaPlan, p: Plan): ValorPlan => {
    if (!foundingGratis || p !== 'BASE') return fila.valor(p);
    // El tope de alumnas es solo de lo gratis: pasado, Founding Studio sigue sin tope.
    if (fila.id === FILA_TOPE_ALUMNAS) return { tipo: 'texto', texto: 'Sin límite' };
    return valorFoundingGratis(fila, ENTITLEMENTS_FOUNDING_GRATIS);
  };
  // Una fila más, justo debajo de la de alumnas: el límite de lo gratis. Pasado,
  // Founding Studio sigue igual pero de pago (decisión del 15-oct-2026).
  const filaReservas: FilaPlan = {
    nombre: 'Reservas al mes',
    detalle: `Founding Studio es gratis ${LIMITES_GRATIS}; ${SI_PASAS}, sin tope.`,
    valor: (p) => ({ tipo: 'texto', texto: p === 'BASE' ? `Gratis hasta ${GRATIS_RESERVAS_MES}` : 'Sin límite' }),
  };
  return (
    // `overflow-clip` y no `hidden`: recorta igual las esquinas, pero no crea un
    // contenedor de scroll, que es lo que impedía a la cabecera quedarse pegada.
    // Los `data-cmp` son para el aspecto de la web pública (app/precios/precios.css).
    <div data-cmp="tabla" className="overflow-clip rounded-2xl border border-border bg-card">
      {/* Cabecera pegajosa contra el scroll de la página. `--cmp-tope` es lo que
          tapa cada pantalla por arriba (la isla de la web); sin él, 0. En móvil
          no hay scroll horizontal: el nombre de cada fila va encima y debajo las
          tres columnas, así que ningún plan queda fuera de la pantalla. */}
      <div data-cmp="cabecera" className={`${COLUMNAS} sticky top-[var(--cmp-tope,0px)] z-10 items-end border-b border-border bg-muted py-3`}>
        <span className="hidden text-[11px] font-semibold uppercase tracking-wider text-muted-foreground sm:block">
          Funcionalidad
        </span>
        {PLANES.map((p) => (
          <span
            key={p}
            className={`text-center text-[12px] font-bold sm:text-[13px] ${
              p === destacado ? 'text-brand-medio' : 'text-foreground'
            }`}
          >
            <NombrePlan plan={p} />
            <span className="block text-[11px] font-medium tabular-nums text-foreground">
              {foundingGratis && p === 'BASE' ? 'Gratis' : `${PLAN_INFO[p].precioMes}€`}
            </span>
            {acciones?.[p]}
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
            {cat.filas.flatMap((fila) => (foundingGratis && fila.id === FILA_TOPE_ALUMNAS ? [fila, filaReservas] : [fila])).map((fila) => (
              <div
                key={fila.nombre}
                data-cmp="fila"
                className={`${COLUMNAS} items-center gap-y-2 py-2.5 odd:bg-muted/25`}
              >
                <div className="col-span-3 min-w-0 sm:col-span-1 sm:pr-2">
                  <div className="text-[13.5px] font-medium leading-snug text-foreground">{fila.nombre}</div>
                  {fila.detalle && (
                    <div className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{fila.detalle}</div>
                  )}
                </div>
                {PLANES.map((p) => (
                  <div key={p} className="flex items-center justify-center text-center">
                    <Marca valor={valorDe(fila, p)} />
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
  foundingGratis = false,
}: {
  abierta: boolean;
  onCerrar: () => void;
  destacado?: Plan;
  /** El alta con Founding Studio gratis: la misma columna que /precios. */
  foundingGratis?: boolean;
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
          <ComparativaPlanes destacado={destacado} todoAbierto foundingGratis={foundingGratis} />
        </div>
      </div>
    </div>
  );
}
