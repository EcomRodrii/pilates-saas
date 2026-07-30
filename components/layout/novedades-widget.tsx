'use client';

import { X, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DashboardSheet } from '@/components/ui/dashboard-sheet';
import { NOVEDADES, type TipoNovedad } from '@/lib/novedades';

const META_TIPO: Record<TipoNovedad, { label: string; className: string }> = {
  MEJORA: { label: 'Mejora', className: 'bg-brand/10 text-brand' },
  ARREGLO: { label: 'Arreglo', className: 'bg-warning/10 text-warning' },
  RENDIMIENTO: { label: 'Rendimiento', className: 'bg-success/10 text-success' },
  SEGURIDAD: { label: 'Seguridad', className: 'bg-destructive/10 text-destructive' },
};

function fechaCorta(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${d} ${MESES[m - 1]}`;
}

export function NovedadesWidget({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <DashboardSheet
      open={open}
      onClose={onClose}
      label="Novedades"
      portal
      backdropClassName="fixed inset-0 z-50 flex items-end lg:items-center justify-center px-0 lg:px-4 bg-black/30"
      backdropStyle={{}}
      sheetClassName="w-full lg:w-[420px] bg-card rounded-t-3xl lg:rounded-3xl shadow-2xl flex flex-col"
      sheetStyle={{ maxHeight: '85vh' }}
    >
      <>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-brand" />
            <div>
              <p className="text-[15px] font-extrabold text-foreground">Novedades</p>
              <p className="text-[12px] text-muted-foreground">Lo que vamos mejorando en Tentare</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Cerrar novedades" className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted">
            <X size={16} className="text-muted-foreground" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4">
          <div className="space-y-4">
            {NOVEDADES.map((n, i) => (
              <div key={i} className="pb-4 border-b border-border last:border-0 last:pb-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={cn('px-2 py-0.5 rounded-full text-[9.5px] font-bold uppercase tracking-wide', META_TIPO[n.tipo].className)}>
                    {META_TIPO[n.tipo].label}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{fechaCorta(n.fecha)}</span>
                </div>
                <p className="text-[13.5px] font-semibold text-foreground">{n.titulo}</p>
                <p className="text-[12.5px] text-muted-foreground mt-0.5 leading-relaxed">{n.descripcion}</p>
              </div>
            ))}
          </div>
        </div>
      </>
    </DashboardSheet>
  );
}
