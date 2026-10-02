'use client';

// Piezas pequeñas de la pantalla de Cobros (rediseño aprobado el 2-oct-2026),
// para que la lista, la ficha y el móvil digan lo mismo con el mismo aspecto.

import type { ReactNode } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TEXTO_ESTADO, type EstadoVisible } from '@/lib/cobros/deudas';

const TONO_ESTADO: Record<EstadoVisible | 'EN_EL_BANCO', string> = {
  DEVUELTO_BANCO: 'bg-destructive/10 text-destructive',
  NO_SE_PUDO: 'bg-destructive/10 text-destructive',
  SIN_COBRAR: 'bg-warning/15 text-foreground',
  EN_EL_BANCO: 'bg-info/12 text-foreground',
};

export function PastillaEstado({ estado }: { estado: EstadoVisible | 'EN_EL_BANCO' }) {
  return (
    <span className={cn('whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-medium', TONO_ESTADO[estado])}>
      {estado === 'EN_EL_BANCO' ? 'En el banco' : TEXTO_ESTADO[estado]}
    </span>
  );
}

/** Un filtro de la lista, con su número. */
export function ChipFiltro({ children, activo, n, onClick }: { children: ReactNode; activo: boolean; n?: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={cn(
        'inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[12.5px] font-medium transition-colors',
        activo ? 'border-foreground bg-foreground text-background' : 'border-border bg-card text-foreground hover:bg-muted',
      )}
    >
      {children}
      {n != null && <span className={cn('tabular-nums', activo ? 'text-background/70' : 'text-muted-foreground')}>{n}</span>}
    </button>
  );
}

export function Buscador({ valor, onCambio, texto, className }: { valor: string; onCambio: (v: string) => void; texto: string; className?: string }) {
  return (
    <label className={cn('relative inline-flex min-h-9 items-center', className)}>
      <Search size={15} className="pointer-events-none absolute left-3 text-muted-foreground" aria-hidden />
      <input
        type="search"
        value={valor}
        onChange={e => onCambio(e.target.value)}
        placeholder={texto}
        aria-label={texto}
        className="h-9 w-full rounded-lg border border-border bg-card pl-9 pr-8 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand/30"
      />
      {valor && (
        <button type="button" onClick={() => onCambio('')} aria-label="Borrar la búsqueda" className="absolute right-2 rounded p-0.5 text-muted-foreground hover:text-foreground">
          <X size={14} />
        </button>
      )}
    </label>
  );
}

/** Quita tildes y mayúsculas, para buscar «maria» y encontrar «María». */
export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
