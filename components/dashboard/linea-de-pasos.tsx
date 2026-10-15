'use client';

// La línea de pasos del panel nuevo (Bonsai b-30…b-36): círculos numerados unidos
// por una línea, el actual relleno y los hechos con ✓. La misma de «Apariencia de
// tu app», pero genérica para que la usen otras pantallas con pasos (Widgets).

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export function LineaDePasos<T extends string>({ pasos, paso, onPaso, hecho }: {
  pasos: readonly { id: T; corto: string }[];
  paso: T;
  onPaso: (p: T) => void;
  /** ¿Lleva ✓ un paso anterior? Por defecto, todos los anteriores al actual. */
  hecho?: (id: T, i: number) => boolean;
}) {
  const actual = pasos.findIndex(p => p.id === paso);
  return (
    <ol className="flex items-center overflow-x-auto py-1 lg:justify-center" aria-label="Pasos">
      {pasos.map((p, i) => {
        const hechoAqui = hecho ? hecho(p.id, i) : i < actual;
        const esActual = i === actual;
        return (
          <li key={p.id} className="flex shrink-0 items-center">
            <button
              type="button"
              onClick={() => onPaso(p.id)}
              aria-label={p.corto}
              aria-current={esActual ? 'step' : undefined}
              className="flex min-h-11 items-center gap-2.5 rounded-full py-1 pr-1 text-[14px] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span
                className={cn('flex size-8 items-center justify-center rounded-full text-[13px] font-semibold', esActual || hechoAqui ? 'text-white' : 'border-[1.5px] border-border bg-card text-muted-foreground')}
                style={esActual || hechoAqui ? { backgroundColor: 'var(--t-blue-500)', boxShadow: esActual ? '0 0 0 4px color-mix(in srgb, var(--t-blue-500) 18%, transparent)' : undefined } : undefined}
              >
                {hechoAqui ? <Check size={15} strokeWidth={2.6} aria-hidden /> : i + 1}
              </span>
              <span className={cn(!esActual && 'hidden sm:inline', esActual ? 'font-semibold text-foreground' : hechoAqui ? 'text-foreground' : 'text-muted-foreground')}>{p.corto}</span>
            </button>
            {i < pasos.length - 1 && (
              <span aria-hidden className="mx-1.5 h-px w-4 sm:mx-3 sm:w-8 xl:mx-4 xl:w-14" style={{ backgroundColor: hechoAqui ? 'var(--t-blue-500)' : 'var(--border)' }} />
            )}
          </li>
        );
      })}
    </ol>
  );
}
