'use client';

import { useMemo } from 'react';
import { Ticket } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { esCodigoReactivacion } from '@/lib/codigos-descuento';
import type { CodigoDescuento } from '@/lib/types';

// Códigos de descuento que el Centro de Control ha enviado en las reactivaciones.
// Existe porque el módulo Marketing (única UI de codigos_descuento) está
// DESACTIVADO por feature flag: sin esta tarjeta el propietario no tendría forma
// de ver qué se prometió a cada socia, ni de revocarlo. Solo lectura + desactivar.
function estadoDe(c: CodigoDescuento, hoy: string): { texto: string; clase: string } {
  if (!c.activo) return { texto: 'Desactivado', clase: 'bg-muted text-muted-foreground' };
  if (c.expira && c.expira < hoy) return { texto: 'Caducado', clase: 'bg-muted text-muted-foreground' };
  if (c.usosMax != null && c.usos >= c.usosMax) return { texto: 'Usado', clase: 'bg-[#D1FAE5] text-[#065F46]' };
  return { texto: 'Activo', clase: 'bg-[#FEF3C7] text-[#92400E]' };
}

function fmtFecha(iso: string | null): string {
  if (!iso) return 'sin caducidad';
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

export function CodigosReactivacion() {
  const { codigosDescuento, toggleCodigoDescuento } = useStudio();
  const hoy = new Date().toISOString().slice(0, 10);

  const codigos = useMemo(
    () => codigosDescuento.filter(esCodigoReactivacion).sort((a, b) => (b.creadoEn ?? '').localeCompare(a.creadoEn ?? '')),
    [codigosDescuento],
  );

  if (codigos.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-heading text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
        Descuentos enviados
      </h2>
      <div className="rounded-3xl border border-border bg-card p-1">
        {codigos.map(c => {
          const est = estadoDe(c, hoy);
          const usados = c.usosMax != null ? `${c.usos}/${c.usosMax}` : String(c.usos);
          return (
            <div key={c.id} className="flex items-center justify-between gap-3 rounded-2xl px-4 py-3 hover:bg-muted/50">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Ticket size={14} className="text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <p className="font-mono text-[13px] font-bold text-foreground">{c.codigo}</p>
                  <p className="truncate text-[12px] text-muted-foreground">
                    {c.tipo === 'PORCENTAJE' ? `${c.valor}%` : `${c.valor}€`} · {c.descripcion} · caduca {fmtFecha(c.expira)} · {usados} usos
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${est.clase}`}>{est.texto}</span>
                {c.activo && (
                  <button
                    onClick={() => toggleCodigoDescuento(c.id)}
                    className="text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Desactivar
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
