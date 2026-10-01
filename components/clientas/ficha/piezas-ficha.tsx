'use client';

import type { ReactNode } from 'react';
import {
  Ban, BellRing, CalendarX, Check, CheckCheck, CircleDollarSign, UserCheck, UserMinus, Mail, MessageCircle, StickyNote, UserPlus,
  RotateCcw, Sparkles, type LucideIcon,
} from 'lucide-react';
import { cn, horaEstudio, hoyEnEstudio } from '@/lib/utils';
import { MenuAcciones, type AccionMenu } from '@/components/ui/menu-acciones';
import type { EventoHistoria, ItemHistoria } from '@/lib/clientas/historia';
import type { AvisoClienta } from '@/lib/clientas/avisos';
import { fechaCorta } from '@/lib/clientas/textos';

// Piezas de la ficha de una clienta (components/clientas/ficha-clienta.tsx).
// Solo pintan: los datos y lo que se puede hacer llegan ya decididos (permisos
// incluidos) desde la ficha.

// ─── Cabecera ────────────────────────────────────────────────────────────────

export interface CeldaCabecera {
  icono: LucideIcon;
  etiqueta: string;
  valor: ReactNode;
  /** Una segunda línea, más baja: «renueva el 21 oct», «quedan 6 · caduca el 30 nov». */
  detalle?: ReactNode;
  tono?: 'aviso' | 'problema';
  /** Si se pulsa, lleva a donde se resuelve (la pestaña de pagos, la de reservas…). */
  onClick?: () => void;
}

export interface AlertaCabecera {
  icono: LucideIcon;
  texto: ReactNode;
  tono?: 'aviso' | 'problema' | 'neutro';
  onClick?: () => void;
}

export function CabeceraFicha({
  avatar, nombre, pastillas, contacto, celdas, alertas, acciones, menu, estrecha,
}: {
  avatar: ReactNode;
  nombre: string;
  /** Estado, aviso, plaza fija… */
  pastillas: ReactNode;
  contacto: ReactNode;
  celdas: CeldaCabecera[];
  alertas: AlertaCabecera[];
  /** Los tres botones grandes: WhatsApp, Llamar, Reservar. */
  acciones: ReactNode;
  menu: AccionMenu[];
  /** En el panel junto a la lista o en el móvil: datos en dos columnas. */
  estrecha?: boolean;
}) {
  return (
    <section aria-label="Quién es" className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
      <div className={cn('flex flex-col gap-4 p-4 sm:p-5', !estrecha && 'md:flex-row md:items-start')}>
        {/* En el móvil el «⋯» va en la esquina: así los tres botones grandes caben enteros. */}
        <div className={cn('flex min-w-0 flex-1 items-start gap-3.5 sm:gap-4', !estrecha && menu.length > 0 && 'pr-10 md:pr-0')}>
          {avatar}
          <div className="min-w-0 flex-1">
            <h1 className="text-[22px] font-semibold leading-tight text-foreground sm:text-[24px]">{nombre}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">{pastillas}</div>
            <div className="mt-1.5 text-[12.5px] text-muted-foreground">{contacto}</div>
          </div>
        </div>
        <div className="flex shrink-0 items-stretch gap-2">
          <div className={cn('grid flex-1 grid-cols-3 gap-2', !estrecha && 'md:flex md:flex-none')}>{acciones}</div>
          {menu.length > 0 && (
            estrecha
              ? <MenuAcciones acciones={menu} />
              : (
                <div className="absolute right-2.5 top-2.5 md:static">
                  <MenuAcciones
                    acciones={menu}
                    claseBoton="flex size-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground md:h-full md:min-h-10 md:w-10 md:rounded-xl md:border md:border-border md:bg-card md:text-foreground"
                  />
                </div>
              )
          )}
        </div>
      </div>
      {celdas.length > 0 && (
        <dl className={cn('grid border-t border-border', estrecha ? 'grid-cols-2' : 'grid-cols-2 lg:grid-cols-4')}>
          {celdas.map((c, i) => {
            const contenido = (
              <>
                <dt className="flex items-center gap-1.5 text-[11.5px] font-medium uppercase tracking-wide text-muted-foreground">
                  <c.icono size={13} aria-hidden />{c.etiqueta}
                </dt>
                <dd className={cn(
                  'mt-0.5 text-[13.5px] font-medium text-pretty',
                  c.tono === 'problema' ? 'text-destructive' : c.tono === 'aviso' ? 'text-warning' : 'text-foreground',
                )}>
                  {c.valor}
                  {c.detalle && <span className="block text-[12.5px] font-normal text-muted-foreground">{c.detalle}</span>}
                </dd>
              </>
            );
            const cls = cn(
              'px-4 py-3 text-left sm:px-5',
              i % 2 === 1 && 'border-l border-border',
              i >= 2 && 'border-t border-border',
              !estrecha && i >= 2 && 'lg:border-t-0',
              !estrecha && i > 0 && 'lg:border-l lg:border-border',
            );
            return c.onClick
              ? <button key={c.etiqueta} type="button" onClick={c.onClick} className={cn(cls, 'transition-colors hover:bg-muted/60')}>{contenido}</button>
              : <div key={c.etiqueta} className={cls}>{contenido}</div>;
          })}
        </dl>
      )}
      {alertas.length > 0 && (
        <ul className="flex flex-wrap gap-x-5 gap-y-1.5 border-t border-border bg-muted/50 px-4 py-2.5 sm:px-5">
          {alertas.map((a, i) => {
            const contenido = (
              <>
                <a.icono size={14} aria-hidden className={cn('mt-px shrink-0', a.tono === 'problema' ? 'text-destructive' : a.tono === 'aviso' ? 'text-warning' : 'text-muted-foreground')} />
                <span className="text-pretty">{a.texto}</span>
              </>
            );
            return (
              <li key={i} className="text-[12.5px] text-foreground">
                {a.onClick
                  ? <button type="button" onClick={a.onClick} className="inline-flex items-start gap-1.5 text-left hover:underline underline-offset-2">{contenido}</button>
                  : <span className="inline-flex items-start gap-1.5">{contenido}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Botón grande de la cabecera. En el móvil van tres en fila, icono encima. */
export function AccionGrande({ icono: Icono, children, href, externo, onClick, primaria, disabled, title }: {
  icono: LucideIcon; children: ReactNode; href?: string | null; externo?: boolean; onClick?: () => void; primaria?: boolean; disabled?: boolean; title?: string;
}) {
  const cls = cn(
    'inline-flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl border px-3 text-[12.5px] font-semibold transition-colors md:min-h-10 md:flex-row md:gap-1.5 md:text-[13.5px]',
    primaria ? 'border-transparent bg-primary text-primary-foreground hover:brightness-95' : 'border-border bg-card text-foreground hover:bg-muted',
    disabled && 'pointer-events-none opacity-45',
  );
  if (href && !disabled) {
    return <a href={href} target={externo ? '_blank' : undefined} rel={externo ? 'noopener noreferrer' : undefined} onClick={onClick} className={cls} title={title}><Icono size={17} aria-hidden />{children}</a>;
  }
  return <button type="button" onClick={onClick} disabled={disabled} className={cls} title={title}><Icono size={17} aria-hidden />{children}</button>;
}

// ─── Por qué te aviso ────────────────────────────────────────────────────────

export function PorQueTeAviso({ aviso, contexto, acciones, atendido }: {
  aviso: AvisoClienta;
  /** Una línea más: cuándo se le escribió por última vez, cuándo renueva… */
  contexto?: ReactNode;
  acciones: ReactNode;
  /** Ya se habló con ella después de que saltara: qué se habló. El aviso se ve resuelto. */
  atendido?: ReactNode;
}) {
  return (
    <section
      aria-label="Por qué te aviso"
      className={cn(
        'rounded-2xl border p-4 sm:p-5',
        atendido ? 'border-border bg-card' : aviso.dinero ? 'border-destructive/30 bg-destructive/[0.05]' : 'border-warning/40 bg-warning/[0.06]',
      )}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-5">
        <div className="min-w-0 flex-1">
          <p className={cn('text-[12px] font-semibold uppercase tracking-wide', atendido ? 'text-muted-foreground' : aviso.dinero ? 'text-destructive' : 'text-warning')}>
            Por qué te aviso · {aviso.etiqueta}
          </p>
          <p className={cn('mt-0.5 text-[15px] font-semibold text-pretty', atendido ? 'text-muted-foreground' : 'text-foreground')}>{aviso.motivo}</p>
          {atendido && (
            <p className="mt-1.5 flex items-start gap-1.5 text-[13px] text-foreground text-pretty">
              <Check size={15} className="mt-0.5 shrink-0 text-success" aria-hidden />
              <span>{atendido}</span>
            </p>
          )}
          {contexto && <p className="mt-1 text-[12.5px] text-muted-foreground text-pretty">{contexto}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">{acciones}</div>
      </div>
    </section>
  );
}

// ─── Historia ────────────────────────────────────────────────────────────────

function lunesDeDia(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  return new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000).toISOString().slice(0, 10);
}

const ICONO_EVENTO: Record<EventoHistoria['tipo'], LucideIcon> = {
  CLASE: Check,
  CLASES: CheckCheck,
  FALTA: Ban,
  CANCELACION: CalendarX,
  CLASE_CANCELADA: CalendarX,
  COBRO: CircleDollarSign,
  COBRO_FALLIDO: CircleDollarSign,
  DEVOLUCION: RotateCcw,
  CORREO: Mail,
  NOTA: StickyNote,
  PLAN: Sparkles,
  ALTA: UserPlus,
  CONTACTO: MessageCircle,
  SEGUIMIENTO: BellRing,
  BAJA: UserMinus,
  VUELTA: UserCheck,
};

// Con los formateadores de `lib/utils`, que se construyen una vez: aquí se
// construían dos por línea de la Historia en cada render.
function cuandoEvento(cuando: string, hoyISO: string | null, soloDia = false): string {
  const dia = cuando.length === 10 ? cuando : hoyEnEstudio(new Date(cuando));
  const fecha = hoyISO ? (dia === hoyISO ? 'Hoy' : fechaCorta(dia, hoyISO)) : dia;
  // Una semana de clases juntas: la hora de la última no dice nada.
  if (cuando.length === 10 || soloDia) return soloDia ? `Semana del ${fechaCorta(lunesDeDia(dia), hoyISO ?? dia)}` : fecha;
  return `${fecha} · ${horaEstudio(cuando)}`;
}

export function LineaHistoria({ items, hoyISO, vacio, accion }: {
  items: ItemHistoria[];
  hoyISO: string | null;
  vacio?: ReactNode;
  /** Algo que hacer con un evento concreto (borrar un contacto que apuntaste tú). */
  accion?: (e: EventoHistoria) => ReactNode;
}) {
  if (items.length === 0) {
    return <p className="py-6 text-center text-[13px] text-muted-foreground">{vacio ?? 'Todavía no ha pasado nada que contar.'}</p>;
  }
  return (
    <ol className="relative">
      <span className="absolute bottom-3 left-[15px] top-3 w-px bg-border" aria-hidden />
      {items.map((item) => {
        if (item.tipo === 'MES') {
          return (
            <li key={item.id} className="relative z-10 pb-1 pt-3 first:pt-1">
              <span className="inline-block rounded-full bg-card pr-2 text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">{item.titulo}</span>
            </li>
          );
        }
        const e = item.evento;
        const Icono = ICONO_EVENTO[e.tipo];
        return (
          <li key={e.id} className="relative flex gap-3 py-2">
            <span className={cn(
              'z-10 flex size-[30px] shrink-0 items-center justify-center rounded-full border bg-card',
              e.tono === 'contacto' && 'border-transparent bg-brand text-brand-foreground',
              e.tono === 'dinero' && 'border-success/30 text-success',
              e.tono === 'problema' && 'border-destructive/30 text-destructive',
              !e.tono && 'border-border text-foreground',
            )}>
              <Icono size={14} aria-hidden />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-[13.5px] font-semibold text-foreground">{e.titulo}</p>
              {e.detalle && <p className="text-[12.5px] text-muted-foreground text-pretty line-clamp-3">{e.detalle}</p>}
              <p className="text-[11.5px] text-muted-foreground">{cuandoEvento(e.cuando, hoyISO, e.tipo === 'CLASES')}{e.quien ? ` · ${e.quien}` : ''}</p>
            </div>
            {accion && <div className="shrink-0 pt-0.5">{accion(e)}</div>}
          </li>
        );
      })}
    </ol>
  );
}

// ─── Constancia ──────────────────────────────────────────────────────────────

export function BarrasConstancia({ semanas }: { semanas: number[] }) {
  const max = Math.max(2, ...semanas);
  return (
    <div className="flex h-12 items-end gap-1.5" role="img" aria-label={`Clases por semana, de hace ${semanas.length - 1} semanas a esta: ${semanas.join(', ')}`}>
      {semanas.map((n, i) => (
        <span
          key={i}
          className={cn('flex-1 rounded-t-[3px]', n === 0 ? 'h-[3px] rounded-[3px] bg-border' : 'bg-brand/80', i === semanas.length - 1 && n > 0 && 'bg-brand')}
          style={n > 0 ? { height: `${Math.max(18, (n / max) * 100)}%` } : undefined}
          title={`${n} ${n === 1 ? 'clase' : 'clases'}`}
        />
      ))}
    </div>
  );
}

