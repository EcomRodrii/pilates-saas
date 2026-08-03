'use client';

import { inicioSemana } from '@/lib/calendario-rango';
import { colorOcupacion } from '@/lib/ocupacion';
import type { DiaMes } from '@/lib/calendario-mes';

function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface VistaMesProps {
  /** Cualquier fecha dentro del mes a mostrar — solo se usa mes/año. */
  mesVisto: Date;
  datos: Map<string, DiaMes>;
  hoyStr: string;
  onSeleccionarDia: (fecha: string) => void;
}

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

// 6 semanas × 7 días: cubre cualquier mes (incluidos los que empiezan en
// domingo y necesitan 6 filas para no cortar el último día), empezando en el
// lunes de la semana que contiene el día 1 — mismo criterio que inicioSemana.
function celdasDelMes(mesVisto: Date): Date[] {
  const primerDia = new Date(mesVisto.getFullYear(), mesVisto.getMonth(), 1);
  const inicio = inicioSemana(primerDia);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(inicio);
    d.setDate(d.getDate() + i);
    return d;
  });
}

export function VistaMes({ mesVisto, datos, hoyStr, onSeleccionarDia }: VistaMesProps) {
  const celdas = celdasDelMes(mesVisto);
  const mesActual = mesVisto.getMonth();

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card">
      <div className="grid grid-cols-7 border-b border-border">
        {DIAS.map(d => (
          <div key={d} className="px-2 py-2 text-center text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            {d}
          </div>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6">
        {celdas.map(dia => {
          const fecha = localDate(dia);
          const d = datos.get(fecha);
          const esHoy = fecha === hoyStr;
          const fueraDeMes = dia.getMonth() !== mesActual;

          return (
            <button
              key={fecha}
              type="button"
              onClick={() => onSeleccionarDia(fecha)}
              aria-label={dia.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
              className="flex flex-col items-start gap-1 border-b border-l border-border/60 p-2 text-left transition-colors hover:bg-muted/60 first:border-l-0 [&:nth-child(7n+1)]:border-l-0"
              style={{ background: esHoy ? 'var(--muted)' : undefined, opacity: fueraDeMes ? 0.4 : 1 }}
            >
              <span className="flex w-full items-center justify-between">
                <span
                  className="text-xs font-bold tabular-nums"
                  style={{ color: esHoy ? 'var(--brand-medio)' : 'var(--foreground)' }}
                >
                  {dia.getDate()}
                </span>
                {d?.hayAtencion && <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ background: 'var(--destructive)' }} />}
              </span>
              {d && d.nClases > 0 && (
                <span className="flex w-full flex-col gap-0.5">
                  <span className="text-[10.5px] font-semibold text-muted-foreground">
                    {d.nClases} {d.nClases === 1 ? 'clase' : 'clases'}
                  </span>
                  <span className="h-1 w-full rounded-full bg-border">
                    <span
                      className="block h-1 rounded-full"
                      style={{ width: `${Math.min(100, Math.round(d.ocupacionMedia * 100))}%`, background: colorOcupacion(d.ocupacionMedia) }}
                    />
                  </span>
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
