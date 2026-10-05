'use client';

import { useState } from 'react';
import { ChevronRight, HeartPulse, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TentiIcono } from '@/components/tenti/tenti-icono';

// «Adaptaciones» en la ficha de la clase: cuántas clientas vienen con notas de
// salud, plegado en una barra (abrirla enseña qué evitar con cada una), y al
// lado «Preparar clase con IA» a la vista. Solo lo ve quien puede ver la ficha
// clínica: lo decide la página.

export interface PreparacionIA {
  resumen: string;
  evitar: string[];
  variantes: string[];
}

export function AdaptacionesClase({ alertas, puedePreparar, preparando, preparacion, error, onPreparar, onCerrarPreparacion }: {
  alertas: string[];
  /** La instructora solo prepara las suyas: el servidor rechaza las de otra. */
  puedePreparar: boolean;
  preparando: boolean;
  preparacion: PreparacionIA | null;
  error: boolean;
  onPreparar: () => void;
  onCerrarPreparacion: () => void;
}) {
  const [abierta, setAbierta] = useState(false);
  return (
    <div className="rounded-xl bg-[color-mix(in_srgb,var(--warning)_10%,var(--card))] px-3.5 py-2.5" data-testid="adaptaciones-clase">
      <div className="flex items-center gap-2">
        <HeartPulse size={15} className="shrink-0 text-destructive" aria-hidden />
        <button
          type="button"
          onClick={() => setAbierta(v => !v)}
          aria-expanded={abierta}
          className="flex min-w-0 flex-1 items-center gap-1 text-left text-[13px] text-foreground"
        >
          <span className="min-w-0">
            <b className="font-semibold">Adaptaciones:</b> {alertas.length === 1 ? '1 clienta con notas de salud' : `${alertas.length} clientas con notas de salud`}
          </span>
          <ChevronRight size={15} className={cn('shrink-0 text-muted-foreground transition-transform', abierta && 'rotate-90')} aria-hidden />
        </button>
        {puedePreparar && !preparacion && (
          <button
            type="button"
            onClick={onPreparar}
            disabled={preparando}
            aria-busy={preparando}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-[12.5px] font-semibold text-foreground hover:bg-card/70 [&:disabled:not([aria-busy=true])]:opacity-50"
          >
            {/* Tenti en sus dos estados: el MISMO objeto, primero quieto y
                después pensando mientras la petición está en vuelo. Ocupado no
                es deshabilitado: no se atenúa. Al llegar la preparación el botón
                se desmonta; Tenti nunca va junto a lo que redacta el modelo. */}
            <TentiIcono ancho={18} estado={preparando ? 'pensando' : 'reposo'} />
            {preparando ? 'Preparando…' : 'Preparar clase con IA'}
          </button>
        )}
      </div>
      {abierta && (
        <ul className="mt-2 space-y-1 pl-6">
          {alertas.map((a, i) => <li key={i} className="text-[12.5px] leading-snug text-foreground">· {a}</li>)}
        </ul>
      )}
      {error && <p className="mt-1.5 pl-6 text-[12px] text-destructive">No se pudo generar la preparación. Inténtalo de nuevo.</p>}
      {preparacion && (
        <div className="mt-2.5 space-y-2 rounded-lg border border-border bg-card p-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[12.5px] leading-snug text-foreground">{preparacion.resumen}</p>
            <button type="button" onClick={onCerrarPreparacion} aria-label="Cerrar la preparación" className="shrink-0 text-muted-foreground hover:text-foreground"><X size={14} /></button>
          </div>
          {preparacion.evitar.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Evitar</p>
              <ul className="space-y-0.5">{preparacion.evitar.map((e, i) => <li key={i} className="text-[12px] leading-snug text-foreground">· {e}</li>)}</ul>
            </div>
          )}
          {preparacion.variantes.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Variantes</p>
              <ul className="space-y-0.5">{preparacion.variantes.map((v, i) => <li key={i} className="text-[12px] leading-snug text-foreground">· {v}</li>)}</ul>
            </div>
          )}
          <p className="text-[11px] italic text-muted-foreground">Sugerencia de IA: revísala antes de aplicarla. No es consejo médico.</p>
        </div>
      )}
    </div>
  );
}
