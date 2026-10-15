'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Lo que una SECCIÓN del panel nuevo necesita además de las piezas de la home
// (`vivo.tsx`), hecho con esas mismas piezas (14-oct-2026):
//
//   · `TarjetaCifraFiltro`: la tarjeta de cifra de la home, pero que filtra la
//     lista de ESTA pantalla en vez de llevar a otra. Un enlace a la misma ruta
//     con otra `?query` no le sirve a una lista que lee la URL al montarse: no
//     se vuelve a montar y el filtro no cambiaría. Es un botón que se queda
//     pulsado mientras su filtro está puesto, y al volver a pulsarlo se quita.
//   · `PestanasVivas`: las pestañas de una sección en píldora segmentada, como
//     el periodo de las gráficas (`Pildoras`) y como las pestañas de Bonsai,
//     pero con su semántica de pestañas y su recuento.
//   · Las clases de los botones secundarios de la cabecera, a juego con la
//     acción principal (`BotonVivo`): con borde, redondos, de su misma altura.
// ─────────────────────────────────────────────────────────────────────────────

import type { ElementType, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Cabecilla, NumeroConLado, TONOS, fondoTenido, type Tono } from './vivo';

/** Un botón secundario de la cabecera, junto a `BotonVivo`. */
export const BOTON_BORDE =
  'zona-tactil inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-border bg-card px-4 text-[13px] font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50';

/** El ⋯ de la cabecera (`MenuAcciones` con `claseBoton`): lo que no cabe a la vista. */
export const BOTON_MENU =
  'zona-tactil flex size-9 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50';

/** La cifra de la home que, pulsada, filtra la lista de debajo (y pulsada otra vez, lo quita). */
export function TarjetaCifraFiltro({ etiqueta, tono, Icono, valor, arriba, abajo, activo, onClick, accion }: {
  etiqueta: string;
  tono: Tono;
  Icono: ElementType;
  valor: ReactNode;
  arriba?: ReactNode;
  abajo: ReactNode;
  /** Su filtro está puesto ahora mismo. */
  activo: boolean;
  onClick: () => void;
  /** Qué hace al pulsarla, para quien no la ve («Ver solo las activas»). */
  accion: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      title={activo ? 'Quitar el filtro' : accion}
      className={cn(
        'group flex min-h-[132px] w-full flex-col rounded-t-card border p-4 text-left shadow-t-card sm:p-5',
        'transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-t-floating focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
      )}
      // Pulsada, más teñida y con el borde de su color: se ve desde lejos qué
      // filtro está puesto, sin leer las píldoras de debajo.
      style={{
        ...fondoTenido(tono, activo ? 26 : 14),
        ...(activo ? { borderColor: TONOS[tono], outline: `1.5px solid ${TONOS[tono]}`, outlineOffset: '-1.5px' } : {}),
      }}
    >
      <Cabecilla etiqueta={etiqueta} tono={tono} Icono={Icono} />
      <NumeroConLado valor={valor} arriba={arriba} abajo={abajo} />
      <span className="sr-only">{activo ? '. Filtro puesto: púlsala para quitarlo.' : `. ${accion}.`}</span>
    </button>
  );
}

/** Las pestañas de una sección, en píldora segmentada. */
export function PestanasVivas<T extends string>({ pestanas, valor, onCambio, etiqueta, dataTour }: {
  pestanas: readonly { id: T; label: string; n?: number | null }[];
  valor: T;
  onCambio: (id: T) => void;
  /** Nombre accesible del grupo («Vista»). */
  etiqueta: string;
  dataTour?: string;
}) {
  return (
    <div role="tablist" aria-label={etiqueta} data-tour={dataTour} className="inline-flex max-w-full gap-1 overflow-x-auto rounded-full bg-muted p-1">
      {pestanas.map(p => {
        const activa = valor === p.id;
        return (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={activa}
            onClick={() => onCambio(p.id)}
            className={cn(
              'zona-tactil inline-flex min-h-9 shrink-0 items-center gap-2 rounded-full px-4 text-[13.5px] font-semibold transition-colors',
              activa ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {p.label}
            {p.n != null && (
              <span className={cn('rounded-full px-1.5 text-[11.5px] tabular-nums', activa ? 'bg-foreground text-background' : 'bg-background text-foreground')}>{p.n}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
