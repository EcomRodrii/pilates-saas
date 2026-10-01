'use client';

import { cn } from '@/lib/utils';

// Los siete días de la semana en una tira, para el Día en el móvil: se toca
// uno y se va a ese día, sin abrir el selector de fecha. El punto, si hay clases.

const INICIAL = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

export function TiraDias({ dias, elegido, hoy, conClase, onElegir }: {
  /** Las siete fechas, como 'YYYY-MM-DD' de calendario. */
  dias: string[];
  elegido: string;
  hoy: string;
  conClase: ReadonlySet<string>;
  onElegir: (dia: string) => void;
}) {
  return (
    <div className="grid grid-cols-7 gap-1" role="group" aria-label="Días de la semana">
      {dias.map(dia => {
        const sel = dia === elegido;
        const fecha = new Date(`${dia}T12:00:00`);
        return (
          <button
            key={dia}
            type="button"
            onClick={() => onElegir(dia)}
            aria-pressed={sel}
            aria-label={`${fecha.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric' })}${dia === hoy ? ', hoy' : ''}`}
            className={cn(
              'flex min-h-14 flex-col items-center justify-center rounded-xl transition-colors',
              sel ? 'bg-brand text-brand-foreground' : dia === hoy ? 'bg-muted text-foreground' : 'text-foreground hover:bg-muted',
            )}
          >
            <span className="text-[11px] font-medium opacity-80">{INICIAL[fecha.getDay()]}</span>
            <span className="text-[16px] font-semibold tabular-nums">{fecha.getDate()}</span>
            <span
              aria-hidden
              className={cn('mt-0.5 h-1 w-4 rounded-full', conClase.has(dia) ? (sel ? 'bg-brand-foreground/70' : 'bg-foreground/35') : 'bg-transparent')}
            />
          </button>
        );
      })}
    </div>
  );
}
