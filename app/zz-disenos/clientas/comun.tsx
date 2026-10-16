'use client';

// TEMPORAL — maquetas de Clientas para enseñar al fundador. No se commitea
// (app/zz-disenos/ está en .git/info/exclude).
import type { ReactNode } from 'react';
import {
  BarChart3, Box, CalendarDays, ClipboardList, Compass, CreditCard, Inbox, LayoutGrid, MessageSquare, Search,
  Settings, Users, UserCog, Bell, Eye, ChevronDown, type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { LogoTentare } from '@/components/marca/logo-tentare';

// ─── Estado único de la clienta (eje 1) ──────────────────────────────────────
export type Estado = 'activa' | 'prueba' | 'sin-renovar' | 'pausada' | 'inactiva' | 'baja' | 'interesada';

export const ESTADOS: Record<Estado, { nombre: string; punto: string; define: string }> = {
  activa: { nombre: 'Activa', punto: 'bg-success', define: 'Puede reservar ahora (cuota vigente o bono con sesiones), o ha venido en los últimos 30 días.' },
  prueba: { nombre: 'De prueba', punto: 'bg-info', define: 'Tiene su clase de prueba y todavía no ha comprado nada más.' },
  'sin-renovar': { nombre: 'Sin renovar', punto: 'bg-warning', define: 'Se le acabó el plan o el bono hace menos de 60 días y no ha vuelto a comprar. Es cuando se la puede recuperar.' },
  pausada: { nombre: 'Pausada', punto: 'bg-muted-foreground', define: 'Tiene la cuota congelada (lesión, viaje…). Vuelve sola cuando acaba la pausa.' },
  inactiva: { nombre: 'Inactiva', punto: 'border border-muted-foreground bg-transparent', define: 'Llegó a venir o a comprar, pero hace más de 60 días.' },
  baja: { nombre: 'De baja', punto: 'bg-foreground/30', define: 'La diste de baja tú, con su motivo. No se le cobra ni recibe campañas.' },
  interesada: { nombre: 'Interesada', punto: 'bg-brand', define: 'Tiene ficha pero nunca ha venido ni comprado.' },
};

export function PastillaEstado({ estado, desde, grande }: { estado: Estado; desde?: string; grande?: boolean }) {
  const e = ESTADOS[estado];
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-card font-medium text-foreground', grande ? 'px-2.5 py-1 text-[13px]' : 'px-2 py-0.5 text-[12px]')}>
      <span className={cn('size-2 shrink-0 rounded-full', e.punto)} aria-hidden />
      {e.nombre}
      {desde && <span className="font-normal text-muted-foreground">· {desde}</span>}
    </span>
  );
}

// ─── Aviso (eje 2): viene del Decision OS, como mucho uno ────────────────────
export function Senal({ children, dinero }: { children: ReactNode; dinero?: boolean }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-medium text-foreground',
      dinero ? 'bg-destructive/12' : 'bg-warning/15',
    )}>
      <span className={cn('size-1.5 rounded-full', dinero ? 'bg-destructive' : 'bg-warning')} aria-hidden />
      {children}
    </span>
  );
}

export function Avatar({ ini, grande, tono = 0 }: { ini: string; grande?: boolean; tono?: number }) {
  const fondos = ['bg-[var(--cat-1)]/25', 'bg-[var(--cat-2)]/25', 'bg-[var(--cat-3)]/25', 'bg-[var(--cat-4)]/25', 'bg-[var(--cat-5)]/25'];
  return (
    <span className={cn('flex shrink-0 items-center justify-center rounded-full font-semibold text-foreground', fondos[tono % fondos.length] ?? 'bg-muted', grande ? 'size-14 text-[18px]' : 'size-9 text-[12.5px]')}>
      {ini}
    </span>
  );
}

export function Boton({ children, icono: Icono, primario, peque, className, peligro }: {
  children?: ReactNode; icono?: LucideIcon; primario?: boolean; peque?: boolean; className?: string; peligro?: boolean;
}) {
  return (
    <span className={cn(
      'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border font-medium',
      peque ? 'min-h-8 px-2.5 text-[12.5px]' : 'min-h-9 px-3.5 text-[13px]',
      primario ? 'border-transparent bg-brand text-brand-foreground' : peligro ? 'border-destructive/40 bg-card text-destructive' : 'border-border bg-card text-foreground',
      className,
    )}>
      {Icono && <Icono size={peque ? 14 : 15} aria-hidden />}
      {children}
    </span>
  );
}

export function Tarjeta({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('rounded-xl border border-border bg-card shadow-xs', className)}>{children}</section>;
}

export function TituloTarjeta({ children, accion, icono: Icono }: { children: ReactNode; accion?: ReactNode; icono?: LucideIcon }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 pt-3.5 pb-2">
      <h3 className="flex items-center gap-2 text-[13.5px] font-semibold text-foreground">
        {Icono && <Icono size={16} className="text-muted-foreground" aria-hidden />}
        {children}
      </h3>
      {accion}
    </div>
  );
}

// Pastilla numerada: marca en la captura qué decisión del fundador hay detrás.
export function Nota({ n }: { n: number }) {
  return (
    <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-[#2B59C3] text-[11px] font-bold text-white shadow" title="Decisión para el fundador">
      {n}
    </span>
  );
}

// ─── Marco del panel (barra lateral + barra de arriba) ───────────────────────
const MENU: { grupo?: string; items: [string, LucideIcon][] }[] = [
  { items: [['Resumen', LayoutGrid], ['Centro de Control', Compass]] },
  { grupo: 'Operación', items: [['Calendario', CalendarDays], ['Citas', ClipboardList], ['Clientas', Users], ['Mensajería', Inbox]] },
  { grupo: 'Equipo', items: [['Equipo', UserCog]] },
  { grupo: 'Negocio', items: [['Cobros', CreditCard], ['Paquetes', Box], ['Informes', BarChart3]] },
  { grupo: 'Estudio', items: [['Configuración', Settings]] },
];

export function Marco({ ancho, children, activo = 'Clientas', sinRelleno }: { ancho: number; children: ReactNode; activo?: string; sinRelleno?: boolean }) {
  return (
    <div className="flex bg-background" style={{ width: ancho }}>
      <aside className="w-[256px] shrink-0 p-4 pr-0">
        <div className="mb-4 px-2 pt-1">
          <LogoTentare formato="horizontal" tinta="auto" producto="manager" alto={44} />
        </div>
        <nav className="rounded-[22px] bg-sidebar px-2 py-3 text-sidebar-foreground">
          {MENU.map((g, i) => (
            <div key={i} className="mb-1">
              {g.grupo && <p className="px-3 pt-3 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/50">{g.grupo}</p>}
              {g.items.map(([nombre, Icono]) => (
                <div key={nombre} className={cn(
                  'flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13.5px]',
                  nombre === activo ? 'bg-brand text-brand-foreground' : 'text-sidebar-foreground/80',
                )}>
                  <Icono size={17} aria-hidden />
                  {nombre}
                </div>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      <main className={cn('min-w-0 flex-1 px-6 pt-4', sinRelleno ? 'pb-4' : 'pb-10')}>
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-[420px] max-w-full items-center gap-2 rounded-full bg-sidebar px-4 text-[13px] text-sidebar-foreground/80">
            <Search size={15} aria-hidden /> ¿Qué quieres hacer o buscar?
            <span className="ml-auto rounded bg-sidebar-foreground/15 px-1.5 text-[10.5px]">⌘K</span>
          </div>
          <div className="ml-auto flex items-center gap-4 text-muted-foreground">
            <Eye size={18} aria-hidden /><MessageSquare size={18} aria-hidden /><Bell size={18} aria-hidden />
            <span className="flex items-center gap-1 text-foreground"><span className="flex size-8 items-center justify-center rounded-full bg-card text-[12px] font-semibold">C</span><ChevronDown size={14} /></span>
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}
