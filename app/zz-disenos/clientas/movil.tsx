'use client';

// TEMPORAL — maquetas móviles de Clientas. No se commitea.
import type { ReactNode } from 'react';
import { ArrowLeft, CreditCard, Download, Menu, MessageCircle, MoreHorizontal, Plus, Search, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LogoTentare } from '@/components/marca/logo-tentare';
import { Avatar, Boton, ESTADOS, PastillaEstado, Senal, Tarjeta } from './comun';
import { CLIENTAS, CONTEOS } from './datos';
import { CabeceraFicha, Notas, Pestanas, SenalExplicada, Seguimientos } from './ficha';

function Telefono({ children, titulo }: { children: ReactNode; titulo: string }) {
  return (
    <figure className="shrink-0">
      <div className="relative h-[844px] w-[390px] overflow-hidden rounded-[44px] border-[10px] border-sidebar bg-background shadow-xl">
        <div className="flex h-11 items-center justify-between px-6 pt-1 text-[13px] font-semibold text-foreground"><span>9:41</span><span className="h-6 w-24 rounded-full bg-sidebar" /><span>100 %</span></div>
        <div className="flex items-center justify-between px-4 pb-2">
          <Menu size={22} className="text-foreground" />
          <LogoTentare formato="horizontal" tinta="auto" producto="manager" alto={26} />
          <span className="flex size-8 items-center justify-center rounded-full bg-card text-[12px] font-semibold">C</span>
        </div>
        <div className="h-[calc(100%-92px)] overflow-hidden px-4">{children}</div>
      </div>
      <figcaption className="mt-3 text-center text-[13.5px] font-medium text-foreground">{titulo}</figcaption>
    </figure>
  );
}

function ListaMovil({ seleccion }: { seleccion?: boolean }) {
  const filas = [...CLIENTAS.filter(c => c.estado === 'activa'), ...CLIENTAS.filter(c => c.estado !== 'activa')];
  const marcada = (i: number) => seleccion && (i === 0 || i === 2);
  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[24px] font-semibold text-foreground">Clientas</h1>
        {seleccion
          ? <span className="text-[15px] font-medium text-foreground">Listo</span>
          : <span className="flex gap-2"><Boton className="min-h-11">Seleccionar</Boton><Boton primario icono={Plus} className="min-h-11 px-3" /></span>}
      </div>
      <div className="mb-3 flex h-11 items-center gap-2 rounded-xl border border-input bg-card px-3 text-[15px] text-muted-foreground"><Search size={17} />Buscar</div>
      <div className="-mx-4 mb-3 flex gap-1.5 overflow-hidden px-4">
        {CONTEOS.slice(0, 5).map(([e, c], i) => (
          <span key={e} className={cn('inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium', i === 1 ? 'border-transparent bg-foreground text-background' : 'border-border bg-card text-foreground')}>
            {e === 'todas' ? 'Todas' : ESTADOS[e].nombre}<span className="opacity-60">{c}</span>
          </span>
        ))}
      </div>
      {!seleccion && (
        <Tarjeta className="mb-3 overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
            <p className="text-[14px] font-semibold text-foreground">Por atender hoy · 5</p>
            <span className="text-[13px] font-medium text-foreground">Ver las 5</span>
          </div>
          {([['María García', 'MG', 'Vino a su prueba el viernes y no ha comprado.'], ['Carmen Del Río', 'CR', 'Lleva 3 semanas sin venir; venía 2 por semana.']] as const).map(([n, ini, m], i) => (
            <div key={n} className="flex items-center gap-3 border-b border-border px-3.5 py-2.5 last:border-b-0">
              <Avatar ini={ini} tono={i + 1} />
              <div className="min-w-0 flex-1"><p className="text-[14.5px] font-semibold text-foreground">{n}</p><p className="text-[12.5px] text-muted-foreground text-pretty">{m}</p></div>
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border bg-card" aria-label="Escribir por WhatsApp"><MessageCircle size={18} /></span>
            </div>
          ))}
        </Tarjeta>
      )}
      <Tarjeta className="overflow-hidden">
        {filas.slice(0, seleccion ? 7 : 4).map((c, i) => (
          <div key={c.id} className={cn('flex min-h-16 items-center gap-3 border-b border-border px-3.5 py-2.5 last:border-b-0', marcada(i) && 'bg-accent')}>
            {seleccion && <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-full border text-[12px]', marcada(i) ? 'border-foreground bg-foreground text-background' : 'border-input')}>{marcada(i) && '✓'}</span>}
            <Avatar ini={c.ini} tono={i} />
            <div className="min-w-0 flex-1">
              <p className="flex items-center justify-between gap-2"><span className="truncate text-[15px] font-semibold text-foreground">{c.nombre}</span><span className="shrink-0 text-[12px] text-muted-foreground">{c.ultima}</span></p>
              <p className="truncate text-[12.5px] text-muted-foreground">{c.plan}{c.saldo ? ` · ${c.saldo}` : ''}</p>
              <p className="mt-1">{c.senal ? <Senal dinero={c.dinero}>{c.senal}</Senal> : <PastillaEstado estado={c.estado} />}</p>
            </div>
          </div>
        ))}
      </Tarjeta>
      {seleccion && (
        <div className="absolute inset-x-0 bottom-0 border-t border-border bg-card px-4 pt-3 pb-7">
          <p className="mb-2 text-center text-[13.5px] font-semibold text-foreground">2 seleccionadas</p>
          <div className="grid grid-cols-4 gap-1.5 text-[12px] text-foreground">
            {([[Tag, 'Etiqueta'], [MessageCircle, 'Mensaje'], [CreditCard, 'Plan'], [Download, 'Exportar']] as const).map(([I, n]) => (
              <span key={n} className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl bg-muted"><I size={18} />{n}</span>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function FichaMovil() {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-[15px] font-medium text-foreground">
        <span className="flex items-center gap-1"><ArrowLeft size={18} />Activas</span>
        <MoreHorizontal size={22} />
      </div>
      <CabeceraFicha movil />
      <SenalExplicada movil />
      <Pestanas movil />
      <Seguimientos />
      <Notas />
    </div>
  );
}

export function DisenoMovil() {
  return (
    <div className="flex gap-10">
      <Telefono titulo="Lista: por atender arriba, estado o aviso en cada fila"><ListaMovil /></Telefono>
      <Telefono titulo="Seleccionar también en el móvil"><ListaMovil seleccion /></Telefono>
      <Telefono titulo="Ficha: quién es, cómo va y qué hago, sin bajar"><FichaMovil /></Telefono>
    </div>
  );
}
