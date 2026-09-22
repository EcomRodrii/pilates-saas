import type { ReactNode } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Info } from 'lucide-react';

// Piezas compartidas por las pantallas de Equipo que hablan de un mes de trabajo
// (Liquidaciones, Tiempo trabajado), para que se lean igual y no diverjan.

export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** ‹ septiembre 2026 › — `mes` de 1 a 12. */
export function SelectorMes({ anio, mes, onCambiar }: { anio: number; mes: number; onCambiar: (anio: number, mes: number) => void }) {
  const ir = (delta: number) => {
    const d = new Date(anio, mes - 1 + delta, 1);
    onCambiar(d.getFullYear(), d.getMonth() + 1);
  };
  return (
    <div className="flex items-center gap-1 rounded-xl border border-border bg-card p-1" data-testid="selector-mes">
      <button onClick={() => ir(-1)} aria-label="Mes anterior" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
        <ChevronLeft size={16} />
      </button>
      <span className="min-w-[132px] text-center text-sm font-semibold capitalize text-foreground">{MESES[mes - 1]} {anio}</span>
      <button onClick={() => ir(1)} aria-label="Mes siguiente" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

export function Cifra({ etiqueta, valor, sub, fuerte = false, tono }: { etiqueta: string; valor: string; sub: string; fuerte?: boolean; tono?: 'aviso' }) {
  return (
    <div className={`rounded-2xl border bg-card p-4 ${tono === 'aviso' ? 'border-amber-500/40' : 'border-border'}`}>
      <p className="text-[12px] text-muted-foreground">{etiqueta}</p>
      <p className={`mt-1 font-bold tabular-nums ${tono === 'aviso' ? 'text-amber-700' : 'text-foreground'} ${fuerte ? 'text-xl' : 'text-lg'}`}>{valor}</p>
      <p className="text-[11px] text-muted-foreground">{sub}</p>
    </div>
  );
}

export function Etiqueta({ tono, children, testId }: { tono: 'neutro' | 'aviso' | 'ok' | 'info' | 'error'; children: ReactNode; testId?: string }) {
  const clases = {
    neutro: 'bg-muted text-muted-foreground',
    aviso: 'bg-amber-500/15 text-amber-700',
    ok: 'bg-emerald-500/15 text-emerald-700',
    info: 'bg-sky-500/15 text-sky-700',
    error: 'bg-red-500/15 text-red-700',
  }[tono];
  return <span data-testid={testId} className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${clases}`}>{children}</span>;
}

export function Nota({ tono, children, testId, accion }: { tono: 'aviso' | 'info'; children: ReactNode; testId?: string; accion?: ReactNode }) {
  return (
    <div data-testid={testId} className={`flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2 text-[12px] leading-relaxed ${tono === 'aviso' ? 'bg-amber-500/10 text-amber-800' : 'bg-muted/60 text-muted-foreground'}`}>
      <p className="flex min-w-0 flex-1 gap-2">
        {tono === 'aviso' ? <AlertTriangle size={14} className="mt-0.5 shrink-0" /> : <Info size={14} className="mt-0.5 shrink-0" />}
        <span>{children}</span>
      </p>
      {accion}
    </div>
  );
}

export const horasMin = (min: number) => `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
