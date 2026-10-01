'use client';

import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Hourglass, TrendingDown, UserX, Users, Wrench, X, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FiltroResumen, ResumenVista } from '@/lib/calendario/marca-clase';
import { textoResumen } from '@/lib/calendario/marca-clase';

// La línea de cifras del Calendario: sustituye a las tres tarjetas de métricas y
// a la franja roja «N necesitan una decisión». Cada cifra se toca y resalta sus
// clases en la rejilla (las demás se atenúan); otra vez, y vuelve todo.
//
// No es una segunda bandeja: lo que espera el visto bueno de la propietaria
// sigue contándose en un solo sitio (la bandeja del Resumen). Esto dice qué
// tiene la semana que estás mirando.

const ESTILO: Record<FiltroResumen, { icono: LucideIcon; tono: string }> = {
  'sin-cubrir': { icono: UserX, tono: 'border-destructive/30 bg-destructive/[0.07] text-destructive' },
  'pasar-lista': { icono: CheckCircle2, tono: 'border-warning/35 bg-warning/10 text-foreground' },
  conflictos: { icono: AlertTriangle, tono: 'border-destructive/30 bg-destructive/[0.07] text-destructive' },
  incidencias: { icono: Wrench, tono: 'border-warning/35 bg-warning/10 text-foreground' },
  flojas: { icono: TrendingDown, tono: 'border-border bg-card text-foreground' },
  espera: { icono: Hourglass, tono: 'border-info/30 bg-info/[0.07] text-foreground' },
  sobreaforo: { icono: Users, tono: 'border-warning/35 bg-warning/10 text-foreground' },
};

export function ResumenCalendario({ resumen, activo, onFiltro, extra }: {
  resumen: ResumenVista;
  activo: FiltroResumen | null;
  onFiltro: (f: FiltroResumen | null) => void;
  /** A la derecha (en el Día de hoy: cuál es la siguiente clase). */
  extra?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2" data-testid="resumen-calendario">
      {/* En una fila que se desliza hasta tener sitio de sobra; desde ahí, la que haga falta. */}
      <div className="-mx-4 -my-1 flex min-w-0 flex-1 items-center gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0">
        <span className="mr-1 shrink-0 text-[13px] tabular-nums text-muted-foreground">{textoResumen(resumen)}</span>
        {resumen.cifras.map(c => {
          const e = ESTILO[c.filtro];
          const pulsada = activo === c.filtro;
          return (
            <button
              key={c.filtro}
              type="button"
              aria-pressed={pulsada}
              onClick={() => onFiltro(pulsada ? null : c.filtro)}
              title={pulsada ? 'Ver todas las clases otra vez' : 'Resaltar estas clases'}
              data-cifra={c.filtro}
              className={cn(
                'inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium transition-[box-shadow,opacity]',
                e.tono,
                pulsada && 'ring-2 ring-foreground/70 ring-offset-1 ring-offset-card',
                activo && !pulsada && 'opacity-60',
              )}
            >
              <e.icono size={13} aria-hidden />
              <span className="font-semibold tabular-nums">{c.n}</span> {c.texto}
              {pulsada && <X size={12} className="-mr-0.5" aria-hidden />}
            </button>
          );
        })}
      </div>
      {extra && <div className="hidden shrink-0 xl:block">{extra}</div>}
    </div>
  );
}
