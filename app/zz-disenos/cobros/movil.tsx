'use client';

// TEMPORAL — Cobros en el móvil y en el iPad del mostrador. No se commitea.
import type { ReactNode } from 'react';
import { CalendarDays, CreditCard, Info, LayoutGrid, Link2, Menu, MessageCircle, Plus, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LogoTentare } from '@/components/marca/logo-tentare';
import { Avatar, BotonC, Buscador, Chip, Marco, PastillaRecibo, Pestanas } from './comun';
import { FichaDeudora, ListaDeudoras, peor } from './deben';
import { DEUDORAS, eur, totalDeuda, type Deudora } from './datos';

export function Telefono({ children, activo = 'Cobros' }: { children: ReactNode; activo?: string }) {
  return (
    <div className="relative flex h-[844px] w-[390px] flex-col overflow-hidden rounded-[44px] border-[10px] border-foreground/85 bg-background shadow-xl">
      <div className="flex items-center justify-between px-5 pt-3 pb-2">
        <LogoTentare formato="horizontal" tinta="auto" producto="manager" alto={28} />
        <span className="flex size-8 items-center justify-center rounded-full bg-card text-[12px] font-semibold text-foreground">C</span>
      </div>
      {children}
      <nav className="mt-auto grid grid-cols-5 border-t border-border bg-card px-2 pt-2 pb-5 text-[11px] text-muted-foreground">
        {([['Resumen', LayoutGrid], ['Clases', CalendarDays], ['Clientas', Users], ['Cobros', CreditCard], ['Más', Menu]] as const).map(([n, I]) => (
          <span key={n} className={cn('flex flex-col items-center gap-0.5', n === activo && 'text-foreground')}>
            <span className={cn('flex h-7 w-11 items-center justify-center rounded-full', n === activo && 'bg-brand text-brand-foreground')}><I size={17} /></span>{n}
          </span>
        ))}
      </nav>
    </div>
  );
}

function FilaMovil({ d }: { d: Deudora }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <Avatar ini={d.ini} tono={d.tono} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14.5px] font-semibold text-foreground">{d.nombre}</p>
        <p className="truncate text-[12.5px] text-muted-foreground">{d.recibos.length === 1 ? d.recibos[0].concepto : `${d.recibos.length} recibos`} · desde el {d.desde}</p>
        <span className="mt-0.5 inline-block"><PastillaRecibo estado={peor(d)} /></span>
      </div>
      <div className="flex flex-col items-end gap-1.5">
        <span className="text-[15px] font-semibold tabular-nums text-foreground">{eur(totalDeuda(d))}</span>
        <span className="inline-flex min-h-11 items-center rounded-xl border border-border px-3 text-[13.5px] font-semibold text-foreground">Cobrar</span>
      </div>
    </div>
  );
}

function ListaMovil() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-4">
        <div className="flex items-center gap-2">
          <h1 className="text-[22px] font-semibold text-foreground">Cobros</h1>
          <Info size={17} className="text-muted-foreground" aria-label="Qué es esta pantalla" />
          <span className="ml-auto inline-flex min-h-10 items-center gap-1 rounded-full bg-brand px-4 text-[13.5px] font-semibold text-brand-foreground"><Plus size={17} />Nuevo cobro</span>
        </div>
        <p className="mt-1.5 text-[14px] text-foreground">Te deben <b className="tabular-nums">696 €</b> <span className="text-muted-foreground">· 7 clientas · 65 € en el banco</span></p>
        <p className="text-[14px] text-foreground">Cobrado en octubre <b className="tabular-nums">1.284 €</b> <span className="text-muted-foreground">· +94 €</span></p>
        <div className="relative -mx-4 mt-3 overflow-hidden px-4">
          <div className="flex gap-1 rounded-xl bg-muted p-1 text-[13px] font-medium">
            <span className="whitespace-nowrap rounded-lg bg-card px-3 py-1.5 text-foreground shadow-xs">Quién me debe <span className="text-muted-foreground">7</span></span>
            <span className="whitespace-nowrap rounded-lg px-3 py-1.5 text-muted-foreground">Lo que he cobrado</span>
            <span className="whitespace-nowrap rounded-lg px-3 py-1.5 text-muted-foreground">Para tu gestoría</span>
          </div>
          <span className="pointer-events-none absolute inset-y-0 right-0 w-14 bg-gradient-to-l from-background to-transparent" aria-hidden />
        </div>
        <div className="-mx-4 mt-2.5 flex gap-2 overflow-hidden px-4">
          <Chip activo n={7}>Todas</Chip><Chip n={1}>Devuelto</Chip><Chip n={3}>No se pudo</Chip><Chip n={4}>Sin cobrar</Chip>
        </div>
      </div>
      <div className="mt-2 divide-y divide-border overflow-hidden">
        {DEUDORAS.slice(0, 5).map(d => <FilaMovil key={d.nombre} d={d} />)}
      </div>
    </div>
  );
}

function HojaFicha() {
  const d = DEUDORAS[0];
  return (
    <div className="absolute inset-x-0 bottom-0 top-[120px] flex flex-col rounded-t-[28px] border-t border-border bg-card shadow-[0_-12px_40px_rgba(0,0,0,0.18)]">
      <span className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-foreground/20" />
      <div className="flex items-center gap-3 border-b border-border px-5 pt-2 pb-3">
        <Avatar ini={d.ini} tono={d.tono} />
        <div>
          <p className="text-[17px] font-semibold text-foreground">{d.nombre}</p>
          <p className="text-[13px] text-muted-foreground">Debe <b className="text-foreground tabular-nums">{eur(totalDeuda(d))}</b> · desde el {d.desde}</p>
        </div>
      </div>
      <div className="space-y-2.5 px-5 pt-3">
        <p className="rounded-lg border border-border px-3 py-2 text-[13px] text-foreground"><CreditCard size={14} className="mr-1 inline text-muted-foreground" />Tarjeta ··4242 <span className="font-medium text-destructive">· caducó en septiembre</span></p>
        <BotonC primario grande className="w-full">Cobrar {eur(totalDeuda(d))}</BotonC>
        <BotonC grande icono={Link2} className="w-full">Pedirle una tarjeta nueva</BotonC>
        <BotonC grande icono={MessageCircle} className="w-full">Escribirle por WhatsApp</BotonC>
        <p className="pt-1 text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">Sus recibos</p>
        {d.recibos.map(r => (
          <div key={r.concepto} className="flex items-center justify-between gap-2 border-b border-border pb-2">
            <div className="min-w-0"><p className="truncate text-[13.5px] text-foreground">{r.concepto}</p><PastillaRecibo estado={r.estado} /></div>
            <span className="text-[13.5px] font-semibold tabular-nums">{eur(r.importe)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DisenoMovilCobros() {
  return (
    <div className="flex gap-10">
      <Telefono><ListaMovil /></Telefono>
      <Telefono><div className="relative flex min-h-0 flex-1 flex-col"><div className="opacity-40"><ListaMovil /></div><HojaFicha /></div></Telefono>
    </div>
  );
}

/** El iPad del mostrador: buscar y cobrar a quien tienes delante, con la ficha al lado. */
export function DisenoIpad() {
  return (
    <Marco ancho={1180} activo="Cobros" sinRelleno>
      <div className="flex items-center gap-2">
        <h1 className="mr-2 text-[22px] font-semibold tracking-tight text-foreground">Cobros</h1>
        <Buscador texto="¿A quién atiendes? Busca a la clienta" ancho="w-[360px]" />
        <span className="ml-auto flex items-center gap-2">
          <BotonC icono={Plus} primario grande>Nuevo cobro</BotonC>
        </span>
      </div>
      <p className="mt-2 text-[14px] text-foreground">Te deben <b className="tabular-nums">696 €</b> <span className="text-muted-foreground">· 7 clientas</span> <span className="mx-1 text-border">|</span> Cobrado hoy <b className="tabular-nums">171 €</b> <span className="text-muted-foreground">· 5 cobros</span></p>
      <Pestanas activa="Quién me debe" compacta />
      <div className="mt-3 flex items-start gap-4">
        <div className="min-w-0 flex-1"><ListaDeudoras compacta /></div>
        <FichaDeudora d={DEUDORAS[2]} />
      </div>
    </Marco>
  );
}
