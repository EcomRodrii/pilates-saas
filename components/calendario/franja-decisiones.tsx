'use client';

import { AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';

export interface DecisionResumen {
  sesionId: string;
  /** "Vie 08:30 · Mat · falta pasar lista" */
  resumen: string;
  /** Para el botón "Ver 08:30". */
  horaCorta: string;
}

// Punto 3: fuera los avisos repartidos por la pantalla. Esta franja SOLO
// existe si hay algo — el caller no la monta cuando `decisiones.length === 0`,
// no hay una versión "vacía" que mostrar.
export function FranjaDecisiones({
  decisiones, indice, onAnterior, onSiguiente, onVer,
}: {
  decisiones: DecisionResumen[];
  indice: number;
  onAnterior: () => void;
  onSiguiente: () => void;
  onVer: (sesionId: string) => void;
}) {
  if (decisiones.length === 0) return null;
  const idx = ((indice % decisiones.length) + decisiones.length) % decisiones.length;
  const actual = decisiones[idx];
  const titulo = decisiones.length === 1
    ? '1 clase necesita una decisión'
    : `${decisiones.length} clases necesitan una decisión`;

  return (
    <div
      className="flex flex-none flex-wrap items-center gap-3 rounded-2xl border px-3.5 py-2.5"
      style={{ background: 'color-mix(in srgb, var(--destructive) 10%, var(--card))', borderColor: 'color-mix(in srgb, var(--destructive) 20%, transparent)' }}
    >
      <span
        className="flex h-6 w-6 flex-none items-center justify-center rounded-full text-white"
        style={{ background: 'var(--destructive)' }}
      >
        <AlertTriangle size={13} />
      </span>
      <p className="whitespace-nowrap text-[13px] font-bold" style={{ color: 'var(--destructive)' }}>{titulo}</p>
      <p className="min-w-[120px] flex-1 truncate text-[12.5px] text-muted-foreground">
        {idx + 1} de {decisiones.length} · {actual.resumen}
      </p>
      <div className="flex flex-none items-center gap-1.5">
        <button
          type="button"
          onClick={onAnterior}
          aria-label="Anterior"
          className="flex h-[30px] w-7 items-center justify-center rounded-l-xl border"
          style={{ borderColor: 'color-mix(in srgb, var(--destructive) 25%, transparent)', color: 'var(--destructive)' }}
        >
          <ChevronLeft size={14} />
        </button>
        <button
          type="button"
          onClick={() => onVer(actual.sesionId)}
          className="whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-bold text-white transition-[filter] hover:brightness-110"
          style={{ background: 'var(--destructive)' }}
        >
          Ver {actual.horaCorta}
        </button>
        <button
          type="button"
          onClick={onSiguiente}
          aria-label="Siguiente"
          className="flex h-[30px] w-7 items-center justify-center rounded-r-xl border"
          style={{ borderColor: 'color-mix(in srgb, var(--destructive) 25%, transparent)', color: 'var(--destructive)' }}
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
