'use client';

// TEMPORAL — maquetas del Calendario para enseñar al fundador. No se commitea.
import type { ReactNode } from 'react';
import {
  AlertTriangle, CalendarDays, CheckCircle2, CheckSquare, ChevronDown, ChevronLeft, ChevronRight, Clock3, DoorOpen, Hourglass,
  Info, Maximize2, PictureInPicture2, Plus, QrCode, RefreshCw, Search, TrendingDown, Upload, UserX, Users, Wrench,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { TIPOS, type Clase } from './datos';

export { Marco, Tarjeta, Nota, Avatar } from '../clientas/comun';

export function tinte(color: string, pct: number) {
  return `color-mix(in srgb, ${color} ${pct}%, var(--card))`;
}

export function BotonC({ children, icono: Icono, primario, peque, className, peligro, grande }: {
  children?: ReactNode; icono?: typeof Plus; primario?: boolean; peque?: boolean; className?: string; peligro?: boolean; grande?: boolean;
}) {
  return (
    <span className={cn(
      'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border font-medium',
      grande ? 'min-h-11 px-4 text-[14px]' : peque ? 'min-h-8 px-2.5 text-[12.5px]' : 'min-h-9 px-3.5 text-[13px]',
      primario ? 'border-transparent bg-brand text-brand-foreground' : peligro ? 'border-destructive/40 bg-card text-destructive' : 'border-border bg-card text-foreground',
      className,
    )}>
      {Icono && <Icono size={peque ? 14 : 15} aria-hidden />}
      {children}
    </span>
  );
}

// ─── Cabecera: TODO lo que hay hoy, ordenado ─────────────────────────────────
// Fila 1 = la pantalla (título, ayuda, ventana flotante, ampliar) y sus
// herramientas (buscar, QR de la puerta, importar, seleccionar varias, crear).
// Fila 2 = qué estás mirando (fecha, vista, sala, instructora).
export function IconoBoton({ icono: Icono, titulo, activo }: { icono: typeof Plus; titulo: string; activo?: boolean }) {
  return (
    <span title={titulo} aria-label={titulo} className={cn('flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground', activo && 'bg-muted text-foreground')}>
      <Icono size={16} aria-hidden />
    </span>
  );
}

export function Herramienta({ icono: Icono, texto, compacta, activa }: { icono: typeof Plus; texto: string; compacta?: boolean; activa?: boolean }) {
  return (
    <span title={texto} className={cn(
      'inline-flex min-h-9 items-center gap-1.5 rounded-lg border text-[13px] font-medium',
      compacta ? 'w-9 justify-center' : 'px-3',
      activa ? 'border-brand bg-brand text-brand-foreground' : 'border-border bg-card text-foreground',
    )}>
      <Icono size={15} aria-hidden className={activa ? '' : 'text-muted-foreground'} />
      {!compacta && texto}
    </span>
  );
}

export function Cabecera({ vista, fecha, nota1, nota2, compacta, seleccionando }: {
  vista: 'Día' | 'Semana' | 'Horario'; fecha: string; nota1?: ReactNode; nota2?: ReactNode; compacta?: boolean; seleccionando?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-1">
        <h1 className="mr-1 text-[24px] font-semibold tracking-tight text-foreground">Calendario</h1>
        <IconoBoton icono={Info} titulo="Qué es esta pantalla" />
        <IconoBoton icono={PictureInPicture2} titulo="Ventana flotante: la agenda del día a mano mientras usas el resto del panel" />
        <IconoBoton icono={Maximize2} titulo="Ampliar a toda la pantalla" />
        <span className="ml-auto flex items-center gap-2">
          <Herramienta icono={Search} texto="Buscar" compacta={compacta} />
          <Herramienta icono={QrCode} texto="Escanear QR" compacta={compacta} />
          <Herramienta icono={Upload} texto="Importar horario" compacta={compacta} />
          <Herramienta icono={CheckSquare} texto={seleccionando ? 'Salir de selección' : 'Seleccionar varias'} compacta={compacta && !seleccionando} activa={seleccionando} />
          {vista === 'Horario'
            ? <BotonC icono={Plus} primario>Nueva clase que se repite</BotonC>
            : <BotonC icono={Plus} primario>Crear clase</BotonC>}
          {nota2}
        </span>
      </div>
      <div className="mt-2.5 flex items-center gap-2.5">
        {vista !== 'Horario' && (
          <>
            <span className="inline-flex items-center rounded-lg border border-border bg-card">
              <span className="flex size-9 items-center justify-center text-muted-foreground"><ChevronLeft size={16} /></span>
              <span className="border-x border-border px-3 py-1.5 text-[13px] font-medium text-foreground">Hoy</span>
              <span className="flex size-9 items-center justify-center text-muted-foreground"><ChevronRight size={16} /></span>
            </span>
            <span className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-[15px] font-semibold text-foreground hover:bg-muted">
              {fecha}<ChevronDown size={15} className="text-muted-foreground" aria-hidden />
            </span>
          </>
        )}
        <span className="inline-flex items-center gap-0.5 rounded-xl bg-muted p-1">
          {(['Día', 'Semana', 'Horario'] as const).map(v => (
            <span key={v} className={cn('rounded-lg px-3.5 py-1.5 text-[13px] font-medium', v === vista ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground')}>{v}</span>
          ))}
        </span>
        {nota1}
        <span className="ml-auto flex items-center gap-2">
          <span className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-[13px] text-foreground"><DoorOpen size={14} className="text-muted-foreground" aria-hidden />Todas las salas<ChevronDown size={14} className="text-muted-foreground" /></span>
          <span className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-[13px] text-foreground"><Users size={14} className="text-muted-foreground" aria-hidden />Todas las instructoras<ChevronDown size={14} className="text-muted-foreground" /></span>
        </span>
      </div>
    </div>
  );
}

// ─── La línea de resumen: cada cifra resalta sus clases ──────────────────────
export function Resumen({ items, texto, extra }: { texto: string; extra?: ReactNode; items: { icono: typeof Plus; n: number; texto: string; tono: 'peligro' | 'aviso' | 'info' | 'neutro' }[] }) {
  const tonos = {
    peligro: 'border-destructive/30 bg-destructive/8 text-destructive',
    aviso: 'border-warning/35 bg-warning/10 text-foreground',
    info: 'border-info/30 bg-info/8 text-foreground',
    neutro: 'border-border bg-card text-foreground',
  };
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className="mr-1 text-[13px] text-muted-foreground tabular-nums">{texto}</span>
      {items.map(i => (
        <span key={i.texto} className={cn('inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium', tonos[i.tono])}>
          <i.icono size={13} aria-hidden />
          <span className="tabular-nums font-semibold">{i.n}</span> {i.texto}
        </span>
      ))}
      {extra && <span className="ml-auto">{extra}</span>}
    </div>
  );
}

export const RESUMEN_SEMANA = [
  { icono: UserX, n: 2, texto: 'sin cubrir', tono: 'peligro' as const },
  { icono: CheckCircle2, n: 2, texto: 'por pasar lista', tono: 'aviso' as const },
  { icono: TrendingDown, n: 3, texto: 'flojas', tono: 'neutro' as const },
  { icono: Hourglass, n: 3, texto: 'con lista de espera', tono: 'info' as const },
  { icono: Wrench, n: 1, texto: 'incidencia', tono: 'aviso' as const },
];

// ─── La clase en la semana: hora, nombre, quién la da, plazas y UNA marca ────
export function TarjetaClase({ c, compacta }: { c: Clase; compacta?: boolean }) {
  const tipo = TIPOS[c.tipo];
  const m = c.marca;
  const cancelada = m?.tipo === 'cancelada';
  const sinCubrir = m?.tipo === 'sin-cubrir' || m?.tipo === 'buscando';
  const llena = c.apuntadas >= c.aforo;
  const fondo = tinte(tipo.color, c.pasada || cancelada ? 16 : 40);
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-lg border pl-2.5 pr-2 py-1.5',
        sinCubrir ? 'border-destructive/60' : 'border-transparent',
        m?.tipo === 'en-curso' && 'ring-2 ring-success ring-offset-1 ring-offset-background',
        (c.pasada || cancelada) && 'opacity-75',
      )}
      style={{ background: fondo }}
    >
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: tipo.color }} aria-hidden />
      <div className="flex items-baseline gap-1.5 text-[12.5px] leading-tight">
        <span className="font-semibold tabular-nums text-foreground">{c.hora}</span>
        {!compacta && <span className={cn('min-w-0 truncate font-semibold text-foreground', cancelada && 'line-through')}>{tipo.nombre}</span>}
        {!cancelada && (
          <span className={cn('ml-auto shrink-0 tabular-nums font-semibold', m?.tipo === 'floja' ? 'text-warning' : 'text-foreground')}>
            {c.apuntadas}/{c.aforo}
          </span>
        )}
      </div>
      {compacta && <p className={cn('truncate text-[12.5px] font-semibold leading-tight text-foreground', cancelada && 'line-through')}>{tipo.nombre}</p>}
      <LineaDos c={c} llena={llena} compacta={compacta} />
    </div>
  );
}

function LineaDos({ c, llena, compacta }: { c: Clase; llena: boolean; compacta?: boolean }) {
  const m = c.marca;
  const base = 'mt-0.5 flex items-center gap-1 text-[12px] leading-tight';
  if (m?.tipo === 'sin-cubrir') return <p className={cn(base, 'font-semibold text-destructive')} title={m.texto}><UserX size={12} className="shrink-0" aria-hidden /><span className="truncate">Sin cubrir</span></p>;
  if (m?.tipo === 'buscando') return <p className={cn(base, 'font-semibold text-destructive')}><RefreshCw size={12} className="shrink-0" aria-hidden /><span className="truncate">{compacta ? 'Buscando' : 'Buscando sustituta'}</span></p>;
  if (m?.tipo === 'pasar-lista') return <p className={cn(base, 'font-semibold text-warning')}><CheckCircle2 size={12} className="shrink-0" aria-hidden /><span className="truncate">Pasar lista</span></p>;
  if (m?.tipo === 'lista-pasada') return <p className={cn(base, 'text-foreground/65')}><CheckCircle2 size={12} className="shrink-0" aria-hidden /><span className="truncate">{m.vinieron} vinieron</span></p>;
  if (m?.tipo === 'incidencia') return <p className={cn(base, 'font-medium text-foreground')}><Wrench size={12} className="shrink-0 text-warning" aria-hidden /><span className="truncate">{m.texto}</span></p>;
  if (m?.tipo === 'cancelada') return <p className={cn(base, 'text-foreground/60')}>Cancelada</p>;
  if (m?.tipo === 'en-curso') return <p className={cn(base, 'font-semibold text-success')}><span className="size-1.5 shrink-0 rounded-full bg-success" aria-hidden /><span className="truncate">{compacta ? 'En curso' : `En curso · ${c.instructora.split(' ')[0]}`}</span></p>;
  if (m?.tipo === 'siguiente') return <p className={cn(base, 'text-foreground/75')}><Clock3 size={12} className="shrink-0" aria-hidden /><span className="truncate">{compacta ? m.texto : `${m.texto} · ${c.instructora.split(' ')[0]}`}</span></p>;
  const quien = compacta ? c.instructora.split(' ')[0] : c.instructora;
  return (
    <p className={cn(base, 'text-foreground/70')}>
      <span className="truncate">{quien}</span>
      {m?.tipo === 'floja' && <span className="ml-auto inline-flex shrink-0 items-center gap-0.5 font-medium text-warning"><TrendingDown size={12} aria-hidden />floja</span>}
      {!m && c.espera > 0 && <span className="ml-auto shrink-0 font-medium text-info">+{c.espera} en espera</span>}
      {!m && llena && c.espera === 0 && <span className="ml-auto shrink-0 font-medium text-foreground/80">llena</span>}
      {!m && !llena && !compacta && c.fijas > 0 && <span className="ml-auto shrink-0">{c.fijas} fijas</span>}
    </p>
  );
}

export function IconoCal() {
  return <CalendarDays size={15} aria-hidden />;
}

export function AvisoCaja({ children, tono = 'aviso' }: { children: ReactNode; tono?: 'aviso' | 'peligro' | 'info' }) {
  return (
    <div className={cn(
      'flex items-start gap-2 rounded-lg px-3 py-2.5 text-[13px] text-pretty',
      tono === 'peligro' ? 'bg-destructive/8 text-foreground' : tono === 'info' ? 'bg-info/8 text-foreground' : 'bg-warning/10 text-foreground',
    )}>
      <AlertTriangle size={15} className={cn('mt-0.5 shrink-0', tono === 'peligro' ? 'text-destructive' : tono === 'info' ? 'text-info' : 'text-warning')} aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
