'use client';

// ─────────────────────────────────────────────────────────────────────────────
// La columna izquierda del calendario en el panel nuevo, como la de Bonsai
// (captura b-40): el mes en pequeño para saltar a otro día, «Solo con alumnas
// apuntadas», y las clases y las instructoras de lo que se está viendo, cada una
// con su ojo. Cerrar un ojo ATENÚA sus clases, no las esconde: es la regla del
// calendario desde I-9 (lib/calendario-filtros.ts), para no perder de vista el
// resto del estudio. Al lado de cada nombre, cuántas clases tiene a la vista.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { INICIALES, MESES, partes, rejillaDelMes } from '@/components/calendario/selector-fecha';
import { foregroundParaFondo } from '@/lib/wcag-contrast';

export interface FilaColumna {
  id: string;
  nombre: string;
  color: string;
  clases: number;
  apagada: boolean;
}

export function ColumnaCalendario({
  abrirEn, desde, hasta, hoy, diasConClase, onElegirDia,
  soloConApuntadas, onSoloConApuntadas,
  tipos, onTipo, instructoras, onInstructora, hayApagadas, onVerTodo,
}: {
  /** Día cuyo mes se enseña (el que se está viendo). */
  abrirEn: string;
  desde: string;
  hasta: string;
  hoy: string;
  diasConClase: ReadonlySet<string>;
  onElegirDia: (dia: string) => void;
  soloConApuntadas: boolean;
  onSoloConApuntadas: (v: boolean) => void;
  tipos: FilaColumna[];
  onTipo: (id: string) => void;
  instructoras: FilaColumna[];
  onInstructora: (id: string) => void;
  hayApagadas: boolean;
  onVerTodo: () => void;
}) {
  return (
    <aside aria-label="Mes y filtros" className="flex w-[212px] shrink-0 flex-col gap-5 overflow-y-auto border-r border-border px-4 py-5">
      {/* Un mes nuevo al cambiar de semana fuera de él: se vuelve a montar. */}
      <MesPequeno key={abrirEn.slice(0, 7)} abrirEn={abrirEn} desde={desde} hasta={hasta} hoy={hoy} diasConClase={diasConClase} onElegir={onElegirDia} />

      <label className="flex cursor-pointer items-center gap-2 text-[13px] text-foreground">
        <input
          type="checkbox"
          checked={soloConApuntadas}
          onChange={e => onSoloConApuntadas(e.target.checked)}
          className="size-4 rounded border-border accent-[color:var(--primary)]"
        />
        Solo con alumnas apuntadas
      </label>

      {tipos.length > 0 && <Lista titulo="Clases" filas={tipos} onAlternar={onTipo} conPunto />}
      {instructoras.length > 0 && <Lista titulo="Instructoras" filas={instructoras} onAlternar={onInstructora} />}

      {hayApagadas && (
        <button type="button" onClick={onVerTodo} className="self-start text-[13px] font-semibold underline-offset-2 hover:underline" style={{ color: 'var(--t-text-link)' }}>
          Ver todas las clases
        </button>
      )}
    </aside>
  );
}

function Lista({ titulo, filas, onAlternar, conPunto = false }: {
  titulo: string; filas: FilaColumna[]; onAlternar: (id: string) => void; conPunto?: boolean;
}) {
  return (
    <section aria-label={titulo}>
      <h3 className="text-[15px] font-bold text-foreground">{titulo}</h3>
      <ul className="mt-2 flex flex-col gap-1.5">
        {filas.map(f => (
          <li key={f.id}>
            <button
              type="button"
              onClick={() => onAlternar(f.id)}
              aria-pressed={!f.apagada}
              aria-label={`${f.apagada ? 'Resaltar' : 'Atenuar'} las clases de ${f.nombre}`}
              className={cn(
                'flex w-full items-center gap-2 rounded-full bg-muted/70 px-3 py-1.5 text-left text-[13px] transition-colors hover:bg-muted',
                f.apagada ? 'text-muted-foreground' : 'text-foreground',
              )}
            >
              {f.apagada ? <EyeOff size={14} aria-hidden className="shrink-0" /> : <Eye size={14} aria-hidden className="shrink-0" />}
              {conPunto
                ? <span aria-hidden className={cn('size-2.5 shrink-0 rounded-full', f.apagada && 'opacity-40')} style={{ backgroundColor: f.color }} />
                // La inicial con la tinta que contrasta con SU color (lo elige el estudio): blanco fijo sobre un arena era 1,7:1.
                : <span aria-hidden className={cn('flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold', f.apagada && 'opacity-40')} style={{ backgroundColor: f.color, color: foregroundParaFondo(f.color) }}>{f.nombre.trim().charAt(0).toUpperCase()}</span>}
              <span className="min-w-0 flex-1 truncate font-medium">{f.nombre}</span>
              <span className="shrink-0 tabular-nums text-[12px] text-muted-foreground">{f.clases}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function MesPequeno({ abrirEn, desde, hasta, hoy, diasConClase, onElegir }: {
  abrirEn: string; desde: string; hasta: string; hoy: string;
  diasConClase: ReadonlySet<string>; onElegir: (dia: string) => void;
}) {
  const [mes, setMes] = useState(() => partes(abrirEn));
  const dias = rejillaDelMes(mes.a, mes.m);
  const prefijoMes = `${mes.a}-${String(mes.m).padStart(2, '0')}-`;
  // Sin la sexta semana si es toda del mes siguiente: la columna no crece de más.
  const visibles = dias.slice(35).every(d => !d.startsWith(prefijoMes)) ? dias.slice(0, 35) : dias;

  function mover(delta: number) {
    setMes(prev => {
      const total = prev.a * 12 + (prev.m - 1) + delta;
      return { a: Math.floor(total / 12), m: (total % 12) + 1, d: 1 };
    });
  }

  return (
    <section aria-label="Elegir día">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-semibold uppercase tracking-[0.04em] text-foreground" aria-live="polite">
          {MESES[mes.m - 1].slice(0, 3)} {mes.a}
        </p>
        <span className="flex">
          <button type="button" onClick={() => mover(-1)} aria-label="Mes anterior" className="flex size-7 items-center justify-center rounded-md text-foreground hover:bg-muted">
            <ChevronLeft size={16} />
          </button>
          <button type="button" onClick={() => mover(1)} aria-label="Mes siguiente" className="flex size-7 items-center justify-center rounded-md text-foreground hover:bg-muted">
            <ChevronRight size={16} />
          </button>
        </span>
      </div>
      <div className="mt-2 grid grid-cols-7 text-center text-[11px] font-medium text-muted-foreground" aria-hidden>
        {INICIALES.map(d => <span key={d}>{d}</span>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-y-0.5 text-center">
        {visibles.map(dia => {
          const fuera = !dia.startsWith(prefijoMes);
          const visto = dia >= desde && dia <= hasta;
          const esHoy = dia === hoy;
          const conClase = diasConClase.has(dia);
          return (
            <button
              key={dia}
              type="button"
              onClick={() => onElegir(dia)}
              aria-label={`${Number(dia.slice(8))} de ${MESES[Number(dia.slice(5, 7)) - 1].toLowerCase()}${conClase ? ', con clases' : ''}${esHoy ? ', hoy' : ''}`}
              aria-current={esHoy ? 'date' : undefined}
              className={cn(
                'relative mx-auto flex size-7 items-center justify-center rounded-full text-[12.5px] tabular-nums transition-colors',
                // Fuera del mes, atenuado pero legible (AA en claro y oscuro): al 50 % se quedaba en 3,1:1.
                fuera ? 'text-muted-foreground' : 'text-foreground',
                visto && !esHoy && 'bg-muted font-semibold',
                esHoy ? 'bg-primary font-semibold text-primary-foreground' : 'hover:bg-muted',
              )}
            >
              {Number(dia.slice(8))}
              {conClase && !esHoy && <span aria-hidden className="absolute bottom-0.5 size-1 rounded-full bg-foreground/35" />}
            </button>
          );
        })}
      </div>
    </section>
  );
}
