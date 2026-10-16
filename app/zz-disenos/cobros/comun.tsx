'use client';

// TEMPORAL — maquetas de Cobros e Informes para enseñar al fundador. No se commitea.
import type { ReactNode } from 'react';
import { Building2, CreditCard, Info, Landmark, Maximize2, Plus, Search, Smartphone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BotonC, IconoBoton } from '../calendario/comun';
import { ESTADO_RECIBO, type EstadoRecibo, type Deudora } from './datos';

export { Marco, Tarjeta, Nota, Avatar } from '../clientas/comun';
export { BotonC, IconoBoton };

export function CabeceraCobros({ nota, compacta }: { nota?: ReactNode; compacta?: boolean }) {
  return (
    <div className="flex items-center gap-1">
      <h1 className="mr-1 text-[24px] font-semibold tracking-tight text-foreground">Cobros</h1>
      <IconoBoton icono={Info} titulo="Qué es esta pantalla" />
      <IconoBoton icono={Maximize2} titulo="Ampliar a toda la pantalla" />
      <span className="ml-auto flex items-center gap-2">
        {!compacta && <BotonC icono={Landmark}>Preparar recibos para el banco</BotonC>}
        <BotonC icono={Plus} primario>Nuevo cobro</BotonC>
        {nota}
      </span>
    </div>
  );
}

/** La línea que responde a las dos preguntas: quién me debe y cuánto he cobrado. */
export function LineaResumen({ compacta, nota }: { compacta?: boolean; nota?: ReactNode }) {
  return (
    <p className={cn('mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-foreground', compacta ? 'text-[14px]' : 'text-[15px]')}>
      {nota}
      <span>Te deben <b className="font-semibold tabular-nums">696 €</b></span>
      <span className="text-muted-foreground">· 7 clientas</span>
      <span className="text-muted-foreground">· <span className="tabular-nums">65 €</span> en el banco</span>
      <span className="mx-1 text-border" aria-hidden>|</span>
      <span>Cobrado en octubre <b className="font-semibold tabular-nums">1.284 €</b></span>
      <span className="text-muted-foreground">· <span className="tabular-nums">+94 €</span> que septiembre a estas alturas</span>
    </p>
  );
}

export function Pestanas({ activa, compacta, nota }: { activa: string; compacta?: boolean; nota?: ReactNode }) {
  const tabs = [['Quién me debe', '7'], ['Lo que he cobrado', ''], ['Para tu gestoría', ''], ['Cambios del equipo', '']];
  return (
    <div className={cn('flex items-center gap-2', compacta ? 'mt-3' : 'mt-4')}>
      <span className="inline-flex max-w-full items-center gap-0.5 overflow-hidden rounded-xl bg-muted p-1">
        {tabs.map(([t, n]) => (
          <span key={t} className={cn('whitespace-nowrap rounded-lg px-3.5 py-1.5 text-[13px] font-medium', t === activa ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground')}>
            {t}{n && <span className="ml-1.5 tabular-nums text-muted-foreground">{n}</span>}
          </span>
        ))}
      </span>
      {nota}
    </div>
  );
}

const TONOS_PASTILLA = {
  peligro: 'bg-destructive/10 text-destructive',
  aviso: 'bg-warning/15 text-foreground',
  info: 'bg-info/12 text-foreground',
  neutro: 'bg-muted text-foreground',
};

export function PastillaRecibo({ estado }: { estado: EstadoRecibo }) {
  const e = ESTADO_RECIBO[estado];
  return <span className={cn('whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-medium', TONOS_PASTILLA[e.tono])}>{e.texto}</span>;
}

export function Chip({ children, activo, n }: { children: ReactNode; activo?: boolean; n?: number }) {
  return (
    <span className={cn('inline-flex min-h-8 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[12.5px] font-medium',
      activo ? 'border-foreground bg-foreground text-background' : 'border-border bg-card text-foreground')}>
      {children}{n != null && <span className={cn('tabular-nums', activo ? 'text-background/70' : 'text-muted-foreground')}>{n}</span>}
    </span>
  );
}

export function Buscador({ texto = 'Buscar clienta o concepto', ancho = 'w-[260px]' }: { texto?: string; ancho?: string }) {
  return (
    <span className={cn('inline-flex min-h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-[13px] text-muted-foreground', ancho)}>
      <Search size={15} aria-hidden />{texto}
    </span>
  );
}

/** Con qué se le puede cobrar: lo que hoy solo se descubre cuando algo falla. */
export function MedioPago({ d, corto }: { d: Deudora; corto?: boolean }) {
  const Icono = d.medio.tipo === 'tarjeta' ? CreditCard : d.medio.tipo === 'mandato' ? Building2 : Smartphone;
  if (corto) {
    return (
      <span title={d.medio.texto} className={cn('inline-flex items-center gap-1 text-[12px]', d.medio.aviso ? 'text-destructive' : 'text-muted-foreground')}>
        <Icono size={13} aria-hidden />
        {d.medio.tipo === 'nada' ? 'Sin tarjeta' : d.medio.aviso ?? (d.medio.tipo === 'mandato' ? 'Domiciliada' : d.medio.texto.split(' · ')[0])}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] text-foreground">
      <Icono size={15} className="text-muted-foreground" aria-hidden />
      {d.medio.texto}
      {d.medio.aviso && <span className="font-medium text-destructive">· {d.medio.aviso}</span>}
    </span>
  );
}
