'use client';

// TEMPORAL — maquetas del Calendario en el móvil. No se commitea.
import type { ReactNode } from 'react';
import {
  CalendarDays, Check, CheckCircle2, CheckSquare, ChevronDown, ChevronLeft, ChevronRight, Clock3, CreditCard, Info, LayoutGrid,
  Menu, Plus, QrCode, Search, TrendingDown, Upload, UserX, Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { LogoTentare } from '@/components/marca/logo-tentare';
import { EN_CURSO, SEMANA, TIPOS, type Clase } from './datos';
import { Avatar, tinte } from './comun';

function Telefono({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex h-[844px] w-[390px] flex-col overflow-hidden rounded-[44px] border-[10px] border-foreground/85 bg-background shadow-xl">
      <div className="flex items-center justify-between px-5 pt-3 pb-2">
        <LogoTentare formato="horizontal" tinta="auto" producto="manager" alto={28} />
        <span className="flex size-8 items-center justify-center rounded-full bg-card text-[12px] font-semibold text-foreground">C</span>
      </div>
      {children}
      <nav className="mt-auto grid grid-cols-5 border-t border-border bg-card px-2 pt-2 pb-5 text-[11px] text-muted-foreground">
        {([['Resumen', LayoutGrid], ['Clases', CalendarDays], ['Clientas', Users], ['Cobros', CreditCard], ['Más', Menu]] as const).map(([n, I]) => (
          <span key={n} className={cn('flex flex-col items-center gap-0.5', n === 'Clases' && 'text-foreground')}>
            <span className={cn('flex h-7 w-11 items-center justify-center rounded-full', n === 'Clases' && 'bg-brand text-brand-foreground')}><I size={17} /></span>{n}
          </span>
        ))}
      </nav>
    </div>
  );
}

function FilaClase({ c }: { c: Clase }) {
  const tipo = TIPOS[c.tipo];
  const m = c.marca;
  return (
    <div className={cn('relative flex gap-3 overflow-hidden rounded-xl border bg-card py-2.5 pl-4 pr-3', m?.tipo === 'en-curso' ? 'border-success ring-1 ring-success' : 'border-border', c.pasada && 'opacity-75')}>
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: tipo.color }} aria-hidden />
      <div className="w-11 shrink-0 text-[14px] font-semibold tabular-nums text-foreground">{c.hora}<p className="text-[12px] font-normal text-muted-foreground">{c.fin}</p></div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-[15px] font-semibold text-foreground">{tipo.nombre}<span className={cn('ml-auto text-[14px] tabular-nums', m?.tipo === 'floja' ? 'text-warning' : 'text-foreground')}>{c.apuntadas}/{c.aforo}{c.espera > 0 && <span className="ml-1 rounded bg-info/15 px-1 text-[11px] text-info">+{c.espera}</span>}</span></p>
        <p className="truncate text-[13px] text-muted-foreground">Sala {c.sala} · {c.instructora}</p>
        {m?.tipo === 'en-curso' && <p className="mt-1 flex items-center gap-1.5 text-[13px] font-semibold text-success"><span className="size-1.5 rounded-full bg-success" />En curso · 4 de 6 han venido</p>}
        {m?.tipo === 'pasar-lista' && <p className="mt-1 flex items-center gap-1.5 text-[13px] font-semibold text-warning"><CheckCircle2 size={14} />Falta pasar lista</p>}
        {m?.tipo === 'lista-pasada' && <p className="mt-1 flex items-center gap-1.5 text-[13px] text-muted-foreground"><CheckCircle2 size={14} />{m.vinieron} vinieron</p>}
        {m?.tipo === 'siguiente' && <p className="mt-1 flex items-center gap-1.5 text-[13px] text-foreground"><Clock3 size={14} />Empieza {m.texto}</p>}
        {m?.tipo === 'floja' && <p className="mt-1 flex items-center gap-1.5 text-[13px] text-warning"><TrendingDown size={14} />Floja: avisa a quien suele venir</p>}
      </div>
    </div>
  );
}

function Agenda() {
  const hoy = SEMANA[0];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-4">
        <div className="flex items-center gap-2">
          <h1 className="text-[22px] font-semibold text-foreground">Calendario</h1>
          <Info size={17} className="text-muted-foreground" aria-label="Qué es esta pantalla" />
          <span className="ml-auto flex size-10 items-center justify-center rounded-full bg-brand text-brand-foreground" title="Crear clase"><Plus size={19} /></span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          {([[Search, 'Buscar'], [QrCode, 'Escanear QR'], [Upload, 'Importar horario'], [CheckSquare, 'Seleccionar varias']] as const).map(([I, t]) => (
            <span key={t} title={t} className="flex size-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground"><I size={17} /></span>
          ))}
          <span className="ml-auto inline-flex min-h-10 items-center gap-1 rounded-full border border-border bg-card px-3 text-[12.5px] text-foreground">Todas las salas<ChevronDown size={13} className="text-muted-foreground" /></span>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="flex items-center gap-1 text-[15px] font-semibold text-foreground">Octubre<ChevronDown size={15} className="text-muted-foreground" /></span>
          <span className="inline-flex rounded-lg bg-muted p-0.5 text-[12.5px] font-medium">
            {['Día', 'Semana', 'Horario'].map(v => <span key={v} className={cn('rounded-md px-2.5 py-1', v === 'Día' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground')}>{v}</span>)}
          </span>
        </div>
        <div className="mt-2.5 grid grid-cols-7 gap-1">
          {SEMANA.map(d => (
            <span key={d.num} className={cn('flex flex-col items-center rounded-xl py-1.5', d.hoy ? 'bg-brand text-brand-foreground' : 'text-foreground')}>
              <span className="text-[11px] font-medium opacity-80">{d.corto.slice(0, 1)}</span>
              <span className="text-[16px] font-semibold tabular-nums">{d.num}</span>
              <span className={cn('mt-0.5 h-1 w-4 rounded-full', d.clases.length ? (d.hoy ? 'bg-brand-foreground/70' : 'bg-foreground/35') : 'bg-transparent')} />
            </span>
          ))}
        </div>
        <div className="-mx-4 mt-3 flex gap-2 overflow-hidden px-4">
          {[[CheckCircle2, '2 por pasar lista', 'border-warning/35 bg-warning/10'], [TrendingDown, '1 floja', 'border-border bg-card'], [UserX, '2 sin cubrir', 'border-destructive/30 bg-destructive/8 text-destructive']].map(([I, t, c]) => {
            const Icono = I as typeof Check;
            return <span key={t as string} className={cn('inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium', c as string)}><Icono size={13} />{t as string}</span>;
          })}
        </div>
      </div>
      <div className="mt-3 space-y-2 overflow-hidden px-4">
        {hoy.clases.slice(1, 6).map(c => <FilaClase key={c.id} c={c} />)}
      </div>
    </div>
  );
}

function Hoja() {
  return (
    <div className="absolute inset-x-0 bottom-0 top-[150px] flex flex-col rounded-t-[28px] border-t border-border bg-card shadow-[0_-12px_40px_rgba(0,0,0,0.18)]">
      <span className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-foreground/20" />
      <div className="border-b border-border px-5 pt-2 pb-3">
        <div className="flex items-center gap-2">
          <span className="size-3 rounded-full" style={{ background: TIPOS.reformer.color }} />
          <h2 className="text-[19px] font-semibold text-foreground">Reformer · 10:30</h2>
          <span className="ml-auto flex items-center gap-1 text-muted-foreground"><ChevronLeft size={20} /><ChevronRight size={20} /><span className="ml-1 text-[20px] leading-none" title="Más acciones">⋯</span></span>
        </div>
        <p className="text-[13px] text-muted-foreground">Sala Reformer · Marta Ruiz · acaba en 40 min</p>
        <p className="mt-1.5 text-[13px] font-semibold text-success">4 de 6 han venido</p>
      </div>
      <ul className="divide-y divide-border">
        {EN_CURSO.map((a, i) => (
          <li key={a.nombre} className="flex items-center gap-3 px-5 py-2">
            <Avatar ini={a.ini} tono={i} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14.5px] font-medium text-foreground">{a.nombre}</p>
              <p className="truncate text-[12px] text-muted-foreground">{a.maquina} · {a.etiquetas.map(e => e.texto).join(' · ')}</p>
            </div>
            {a.llego
              ? <span className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-success/15 px-3 text-[13.5px] font-semibold text-success"><Check size={16} strokeWidth={2.5} />Vino</span>
              : <span className="inline-flex min-h-11 items-center rounded-xl border border-border px-3 text-[13.5px] font-semibold text-foreground">Check-in</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DisenoMovil() {
  return (
    <div className="flex gap-10">
      <Telefono><Agenda /></Telefono>
      <Telefono><div className="relative flex min-h-0 flex-1 flex-col"><div className="opacity-40"><Agenda /></div><Hoja /></div></Telefono>
    </div>
  );
}
