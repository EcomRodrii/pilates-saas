'use client';

// Piezas pequeñas del módulo Festivos: la hoja de calendario de cada fila (como
// la de Bonsai, con el mes arriba en color y el día grande), la chapa de su
// ámbito y la de su origen, y el botón con el borde que gira de la búsqueda con
// IA (el único que se mueve en la pantalla, como el de Bonsai).

import type { ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { hojaDeCalendario, TEXTO_AMBITO, type Ambito } from '@/lib/festivos/lista';

/** El color de cada ámbito: el mismo en la chapa de la lista y en la del buscador. */
export const COLOR_AMBITO: Record<Ambito, string> = {
  nacional: 'var(--t-blue-500)',
  autonomico: 'var(--cat-2)',
  local: 'var(--warning)',
  propio: 'var(--cat-5)',
};

export function HojaCalendario({ fecha, apagada = false }: { fecha: string; apagada?: boolean }) {
  const h = hojaDeCalendario(fecha);
  return (
    <div
      aria-hidden
      className={cn('flex w-12 shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-card text-center shadow-sm', apagada && 'opacity-55')}
    >
      <span className="py-[3px] text-[10px] font-bold tracking-[0.08em]" style={{ backgroundColor: 'var(--t-magenta-500)', color: 'var(--card)' }}>{h.mes}</span>
      <span className="py-1.5 text-[20px] font-bold leading-none text-foreground tabular-nums">{h.dia}</span>
    </div>
  );
}

export function Chapa({ color, children, title }: { color: string; children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-tight"
      style={{ color: `color-mix(in srgb, ${color} 78%, var(--foreground))`, backgroundColor: `color-mix(in srgb, ${color} 13%, transparent)` }}
    >
      {children}
    </span>
  );
}

export function ChapaAmbito({ ambito }: { ambito: Ambito }) {
  return <Chapa color={COLOR_AMBITO[ambito]}>{TEXTO_AMBITO[ambito]}</Chapa>;
}

/** «IA»: lo propuso la búsqueda con IA y lo confirmó el estudio. */
export function ChapaIA({ texto = 'IA' }: { texto?: string }) {
  return (
    <Chapa color="var(--t-magenta-500)" title="Lo encontró la búsqueda con IA">
      <Sparkles size={11} aria-hidden /> {texto}
    </Chapa>
  );
}

/**
 * El botón de la búsqueda con IA, con el borde del degradado del logo girando
 * (Bonsai lo hace con su azul y su verde). `buscando` lo acelera. Con «reducir
 * movimiento», globals.css deja la animación en ~0: el borde se queda quieto.
 */
export function BotonBordeVivo({ children, onClick, disabled, buscando = false, type = 'button', className }: {
  children: ReactNode; onClick?: () => void; disabled?: boolean; buscando?: boolean; type?: 'button' | 'submit'; className?: string;
}) {
  return (
    <span className={cn('relative inline-flex overflow-hidden rounded-full p-[2px] shadow-[0_6px_18px_-10px_var(--t-magenta-500)]', disabled && !buscando && 'opacity-60', className)}>
      {/* Un CUADRADO más ancho que el botón, centrado, que gira: en un botón
          ancho y bajo, girar su propio rectángulo dejaba los lados sin color. */}
      <span aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[max(220%,240px)] -translate-x-1/2 -translate-y-1/2">
        <span
          className={cn(
            'block size-full bg-[conic-gradient(from_0deg,var(--t-blue-500),var(--t-magenta-500),var(--cat-2),var(--t-blue-500))]',
            buscando ? 'animate-[spin_1.4s_linear_infinite]' : 'animate-[spin_3.5s_linear_infinite]',
          )}
        />
      </span>
      <button
        type={type}
        onClick={onClick}
        disabled={disabled}
        className="relative inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-full bg-card px-5 text-[13.5px] font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed"
      >
        {children}
      </button>
    </span>
  );
}
