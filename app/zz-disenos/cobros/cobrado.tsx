'use client';

// TEMPORAL — «Lo que he cobrado»: solo lo cobrado, por método. No se commitea.
import { ChevronLeft, ChevronRight, Download, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BotonC, Buscador, CabeceraCobros, LineaResumen, Nota, Pestanas, Tarjeta } from './comun';
import { COBRADO_OCT, COBRADO_SEP_A_ESTAS_ALTURAS, COBROS_HOY, DEVUELTO_OCT, METODOS, eur } from './datos';

export function SelectorPeriodo({ activo = 'Mes', texto = 'Octubre', nota }: { activo?: string; texto?: string; nota?: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="inline-flex items-center gap-0.5 rounded-xl bg-muted p-1">
        {['Hoy', 'Semana', 'Mes'].map(p => (
          <span key={p} className={cn('rounded-lg px-3 py-1.5 text-[13px] font-medium', p === activo ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground')}>{p}</span>
        ))}
      </span>
      <span className="inline-flex items-center rounded-lg border border-border bg-card">
        <span className="flex size-9 items-center justify-center text-muted-foreground"><ChevronLeft size={16} /></span>
        <span className="border-x border-border px-3 py-1.5 text-[13px] font-semibold text-foreground">{texto}</span>
        <span className="flex size-9 items-center justify-center text-muted-foreground"><ChevronRight size={16} /></span>
      </span>
      {nota}
    </span>
  );
}

export function DesgloseMetodos() {
  const max = Math.max(...METODOS.map(m => m.total));
  return (
    <Tarjeta className="p-4">
      <p className="text-[13.5px] font-semibold text-foreground">Cómo te han pagado</p>
      <p className="text-[12.5px] text-muted-foreground">Para cuadrar la caja y el banco. Lo devuelto se resta en su método.</p>
      <div className="mt-3 space-y-2">
        {METODOS.map(m => (
          <div key={m.metodo} className="grid grid-cols-[170px_1fr_90px] items-center gap-3">
            <span className="text-[13px] text-foreground">{m.metodo} <span className="text-muted-foreground tabular-nums">· {m.n}</span></span>
            <span className="h-2 rounded-full bg-muted">
              <span className="block h-2 rounded-full bg-foreground/70" style={{ width: `${(m.total / max) * 100}%` }} />
            </span>
            <span className="text-right text-[13px] font-semibold tabular-nums text-foreground">{eur(m.total - (m.metodo === 'Efectivo' ? DEVUELTO_OCT : 0))}</span>
          </div>
        ))}
        <div className="grid grid-cols-[170px_1fr_90px] items-center gap-3 border-t border-border pt-2">
          <span className="text-[13px] text-muted-foreground">Sin especificar <span className="tabular-nums">· 0</span></span>
          <span />
          <span className="text-right text-[13px] tabular-nums text-muted-foreground">0 €</span>
        </div>
      </div>
    </Tarjeta>
  );
}

export function ListaCobros() {
  return (
    <Tarjeta className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-2">
        <span className="text-[12.5px] font-semibold text-foreground">Hoy, viernes 2 de octubre</span>
        <span className="text-[12.5px] font-semibold tabular-nums text-foreground">{eur(COBROS_HOY.reduce((a, c) => a + c.importe, 0))}</span>
      </div>
      <div className="divide-y divide-border">
        {COBROS_HOY.map(c => (
          <div key={c.hora + c.concepto} className="grid grid-cols-[52px_1fr_190px_90px] items-center gap-3 px-4 py-2.5">
            <span className="text-[12.5px] tabular-nums text-muted-foreground">{c.hora}</span>
            <div className="min-w-0">
              <p className="truncate text-[13.5px] font-medium text-foreground">{c.nombre}</p>
              <p className="truncate text-[12.5px] text-muted-foreground">{c.concepto}</p>
            </div>
            <span className="text-[12.5px] text-muted-foreground">{c.metodo}</span>
            <span className={cn('text-right text-[13.5px] font-semibold tabular-nums', c.importe < 0 ? 'text-destructive' : 'text-foreground')}>{eur(c.importe)}</span>
          </div>
        ))}
      </div>
      <div className="border-t border-border bg-muted/40 px-4 py-2 text-[12.5px] font-semibold text-foreground">Ayer, jueves 1 de octubre · 16 cobros · <span className="tabular-nums">1.113 €</span></div>
    </Tarjeta>
  );
}

export function DisenoCobrado() {
  return (
    <div>
      <CabeceraCobros />
      <LineaResumen />
      <Pestanas activa="Lo que he cobrado" />
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <SelectorPeriodo nota={<Nota n={3} />} />
        <span className="ml-auto flex items-center gap-2">
          <Buscador ancho="w-[220px]" />
          <BotonC icono={Wallet}>Cerrar la caja</BotonC>
          <BotonC icono={Download}>Descargar para la gestoría</BotonC>
        </span>
      </div>
      <div className="mt-4 flex items-end gap-6">
        <div>
          <p className="text-[12.5px] text-muted-foreground">Cobrado en octubre, hasta hoy · neto, ya restado lo devuelto</p>
          <p className="text-[34px] font-semibold tracking-tight tabular-nums text-foreground">{eur(COBRADO_OCT)}</p>
        </div>
        <p className="pb-2 text-[13.5px] text-muted-foreground">
          <b className="font-semibold text-success tabular-nums">+{eur(COBRADO_OCT - COBRADO_SEP_A_ESTAS_ALTURAS)}</b> frente a septiembre a estas alturas ({eur(COBRADO_SEP_A_ESTAS_ALTURAS)}) · 20 cobros · 1 devolución
        </p>
      </div>
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)_420px] items-start gap-5">
        <ListaCobros />
        <DesgloseMetodos />
      </div>
    </div>
  );
}
