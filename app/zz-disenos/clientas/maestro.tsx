'use client';

// TEMPORAL — maqueta lista + ficha a la vez (iPad en horizontal y escritorio). No se commitea.
import { ArrowUpRight, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, Senal, Tarjeta } from './comun';
import { CLIENTAS } from './datos';
import { CabeceraClientas, FiltrosEstado } from './lista';
import { CabeceraFicha, Pestanas, ResumenFicha, SenalExplicada } from './ficha';

const ACTIVAS = [
  ...CLIENTAS.filter(c => c.estado === 'activa'),
  { id: 'x1', nombre: 'Nuria Vidal', ini: 'NV', plan: 'Mensual ilimitado', saldo: 'Renueva el 3 nov', ultima: 'hoy' },
  { id: 'x2', nombre: 'Marta Romero', ini: 'MR', plan: 'Bono 5 clases', saldo: 'Quedan 3', ultima: 'hace 4 días' },
  { id: 'x3', nombre: 'Claudia Ibáñez', ini: 'CI', plan: 'Mensual 1×/semana', saldo: 'Renueva el 18 oct', ultima: 'hace 6 días' },
] as { id: string; nombre: string; ini: string; plan: string; saldo?: string; ultima: string; senal?: string; dinero?: boolean }[];

export function DisenoMaestro() {
  return (
    <>
      <CabeceraClientas />
      <FiltrosEstado activo="activa" />
      <div className="grid grid-cols-[360px_minmax(0,1fr)] items-start gap-4">
        <Tarjeta className="overflow-hidden">
          <div className="border-b border-border p-2.5">
            <div className="flex h-9 items-center gap-2 rounded-lg border border-input px-2.5 text-[13px] text-muted-foreground"><Search size={15} />Buscar<span className="ml-auto rounded border border-border px-1.5 text-[11px]">/</span></div>
          </div>
          <ul>
            {ACTIVAS.map((c, i) => (
              <li key={c.id} className={cn('flex gap-3 border-b border-border px-3 py-2.5', i === 0 && 'bg-accent shadow-[inset_3px_0_0_var(--brand)]')}>
                <Avatar ini={c.ini} tono={i} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center justify-between gap-2 text-[13.5px] font-semibold text-foreground"><span className="truncate">{c.nombre}</span><span className="shrink-0 text-[11.5px] font-normal text-muted-foreground">{c.ultima}</span></p>
                  <p className="truncate text-[12.5px] text-muted-foreground">{c.plan}{c.saldo ? ` · ${c.saldo}` : ''}</p>
                  {c.senal && <span className="mt-1 inline-block"><Senal dinero={c.dinero}>{c.senal}</Senal></span>}
                </div>
              </li>
            ))}
          </ul>
          <p className="px-3 py-2 text-[11.5px] text-muted-foreground">↑ ↓ para moverte · Enter abre · Esc cierra</p>
        </Tarjeta>
        <div className="min-w-0 space-y-4">
          <div className="flex items-center justify-end gap-3 text-[12.5px] font-medium text-foreground">
            <span className="flex items-center gap-1">Abrir en página completa <ArrowUpRight size={14} /></span>
            <X size={17} className="text-muted-foreground" />
          </div>
          <CabeceraFicha enPanel />
          <SenalExplicada />
          <Pestanas />
          <ResumenFicha estrecho />
        </div>
      </div>
    </>
  );
}
