'use client';

// Piezas pequeñas de Informes (rediseño del 2-oct-2026), con el aspecto de la
// pantalla nueva de Cobros: el selector de periodo con flechas, el titular de
// tres hechos y la diferencia frente al mismo tramo del periodo anterior.

import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn, formatEuro } from '@/lib/utils';
import { textoDelPeriodo, type Periodo } from '@/lib/cobros/lo-cobrado';
import { CifraPrivada } from '@/components/ui/cifra-privada';

export type PeriodoInforme = Exclude<Periodo, 'DIA'>;

// En el móvil sin Semana (decisión 10): siete barras de un día no dicen nada en 375 px.
const PERIODOS: { id: PeriodoInforme; texto: string; soloAncho?: boolean }[] = [
  { id: 'SEMANA', texto: 'Semana', soloAncho: true },
  { id: 'MES', texto: 'Mes' },
  { id: 'TRIMESTRE', texto: 'Trimestre' },
  { id: 'ANIO', texto: 'Año' },
];

export function SelectorPeriodo({ periodo, referencia, hoy, haySiguiente, onPeriodo, onMover }: {
  periodo: PeriodoInforme;
  referencia: string;
  hoy: string;
  haySiguiente: boolean;
  onPeriodo: (p: PeriodoInforme) => void;
  onMover: (paso: -1 | 1) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex items-center gap-0.5 rounded-xl bg-muted p-1" role="group" aria-label="Periodo">
        {PERIODOS.map(p => (
          <button
            key={p.id} type="button" onClick={() => onPeriodo(p.id)} aria-pressed={periodo === p.id}
            className={cn(
              'min-h-8 items-center rounded-lg px-3 text-[13px] font-medium transition-colors',
              p.soloAncho ? 'hidden sm:inline-flex' : 'inline-flex',
              periodo === p.id ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {p.texto}
          </button>
        ))}
      </div>
      <div className="inline-flex items-center rounded-lg border border-border bg-card">
        <button type="button" onClick={() => onMover(-1)} aria-label="Periodo anterior" className="flex size-9 items-center justify-center text-muted-foreground hover:text-foreground">
          <ChevronLeft size={16} />
        </button>
        <span className="min-w-32 border-x border-border px-3 py-1.5 text-center text-[13px] font-semibold text-foreground" aria-live="polite" data-testid="informe-periodo">
          {textoDelPeriodo(periodo, referencia, hoy)}
        </span>
        <button type="button" onClick={() => onMover(1)} disabled={!haySiguiente} aria-label="Periodo siguiente" className="flex size-9 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30">
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

/**
 * «frente a septiembre», «frente al trimestre anterior»: `textoDeLaComparacion`
 * devuelve «el trimestre anterior», y «frente a el» no se dice.
 */
export const frenteA = (c: string) => (c.startsWith('el ') ? `frente al ${c.slice(3)}` : `frente a ${c}`);

/** «+12,00 €» / «−3,50 €». */
export const conSignoEuros = (n: number) => `${n >= 0 ? '+' : '−'}${formatEuro(Math.abs(n))}`;
/** «+3» / «−1» / «+4 puntos». */
export const conSigno = (n: number, unidad = '') => `${n >= 0 ? '+' : '−'}${Math.abs(n)}${unidad}`;

export function tonoDiferencia(n: number | null): string {
  if (n == null || n === 0) return 'text-muted-foreground';
  return n > 0 ? 'text-success' : 'text-destructive';
}

/** Uno de los tres hechos del titular. */
export function Hecho({ titulo, valor, comparacion, nota, testId }: {
  titulo: string;
  valor: ReactNode;
  /** La diferencia ya escrita y su tono, o `null` si no hay con qué comparar. */
  /** `frente`: la frase entera, «frente a septiembre (120,00 €)». */
  comparacion: { texto: ReactNode; tono: string; frente: ReactNode } | null;
  nota?: ReactNode;
  testId?: string;
}) {
  return (
    <div className="min-w-0 px-4 py-3.5 sm:px-5" data-testid={testId}>
      <p className="text-[12.5px] text-muted-foreground">{titulo}</p>
      <p className="text-[28px] font-semibold leading-tight tracking-tight tabular-nums text-foreground" data-valor>{valor}</p>
      {comparacion && (
        <p className="text-[12.5px] text-muted-foreground">
          <b className={cn('font-semibold tabular-nums', comparacion.tono)}>{comparacion.texto}</b> {comparacion.frente}
        </p>
      )}
      {nota && <p className="mt-0.5 text-[12px] text-muted-foreground">{nota}</p>}
    </div>
  );
}

/** Cabecera de cada bloque: un nombre y, debajo, qué cuenta. */
export function CabeceraBloque({ id, titulo, children, acciones }: { id: string; titulo: string; children?: ReactNode; acciones?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <h2 id={id} className="text-[17px] font-semibold text-foreground">{titulo}</h2>
        {children && <p className="max-w-[760px] text-[12.5px] text-muted-foreground text-pretty">{children}</p>}
      </div>
      {acciones}
    </div>
  );
}

export function Euros({ n }: { n: number }) {
  return <CifraPrivada inline>{formatEuro(n)}</CifraPrivada>;
}
