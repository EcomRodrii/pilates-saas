'use client';

import type { ReactNode } from 'react';
import { Bell, Check, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DEFINICION_ESTADO, ETIQUETA_ESTADO, type EstadoClienta } from '@/lib/clientas/estado';
import type { AvisoClienta } from '@/lib/clientas/avisos';

// Las piezas que comparten la lista y la ficha de Clientas: el estado (uno por
// clienta, lib/clientas/estado.ts) y el aviso (como mucho uno, lib/clientas/
// avisos.ts). Un punto de color + la palabra: el color nunca va solo.

const PUNTO: Record<EstadoClienta, string> = {
  ACTIVA: 'bg-success',
  DE_PRUEBA: 'bg-info',
  SIN_RENOVAR: 'bg-warning',
  PAUSADA: 'bg-muted-foreground',
  INACTIVA: 'border border-muted-foreground bg-transparent',
  DE_BAJA: 'bg-foreground/30',
  INTERESADA: 'bg-brand',
};

export function PuntoEstado({ estado, className }: { estado: EstadoClienta; className?: string }) {
  return <span className={cn('size-2 shrink-0 rounded-full', PUNTO[estado], className)} aria-hidden />;
}

export function PastillaEstado({ estado, desde, grande, className }: {
  estado: EstadoClienta;
  /** El complemento: «desde mar 2025», «hace 12 días»… */
  desde?: string | null;
  grande?: boolean;
  className?: string;
}) {
  return (
    <span
      title={DEFINICION_ESTADO[estado]}
      data-estado={estado}
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-card font-medium text-foreground',
        grande ? 'px-2.5 py-1 text-[13px]' : 'px-2 py-0.5 text-[12px]',
        className,
      )}
    >
      <PuntoEstado estado={estado} />
      {ETIQUETA_ESTADO[estado]}
      {desde && <span className="truncate font-normal text-muted-foreground">· {desde}</span>}
    </span>
  );
}

export function PastillaAviso({ aviso, atendido, ella = 'ella', className }: {
  aviso: AvisoClienta;
  /** «ella» / «él». */
  ella?: string;
  /** Ya se habló con ella después de que saltara: se pinta como hecho, no como pendiente. */
  atendido?: boolean;
  className?: string;
}) {
  if (atendido) {
    return (
      <span
        title={`${aviso.motivo} Ya se ha hablado con ${ella}; el Centro de Control lo retira solo en su próxima revisión.`}
        data-aviso-atendido
        className={cn('inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-full border border-border px-2 py-0.5 text-[12px] font-medium text-muted-foreground', className)}
      >
        <Check size={12} className="shrink-0 text-success" aria-hidden />
        <span className="truncate">{aviso.etiqueta} · hablado</span>
      </span>
    );
  }
  return (
    <span
      title={aviso.motivo}
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-medium text-foreground',
        aviso.dinero ? 'bg-destructive/12' : 'bg-warning/15',
        className,
      )}
    >
      <span className={cn('size-1.5 shrink-0 rounded-full', aviso.dinero ? 'bg-destructive' : 'bg-warning')} aria-hidden />
      <span className="truncate">{aviso.etiqueta}</span>
    </span>
  );
}

/** Tarjeta de la ficha: borde suave, título pequeño con icono y una acción a la derecha. */
export function TarjetaFicha({ titulo, icono, accion, children, className, id }: {
  titulo?: ReactNode;
  icono?: ReactNode;
  accion?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn('rounded-2xl border border-border bg-card shadow-xs', className)}>
      {(titulo || accion) && (
        <div className="flex items-center justify-between gap-3 px-4 pt-3.5 pb-2 sm:px-5">
          {titulo && (
            <h3 className="flex min-w-0 items-center gap-2 text-[13.5px] font-semibold text-foreground">
              {icono && <span className="shrink-0 text-muted-foreground" aria-hidden>{icono}</span>}
              <span className="truncate">{titulo}</span>
            </h3>
          )}
          {accion}
        </div>
      )}
      <div className="px-4 pb-4 sm:px-5">{children}</div>
    </section>
  );
}

/** Botón secundario de la cabecera de una tarjeta («Pausar», «Cambiar plan»). */
export function BotonTarjeta({ icono: Icono, children, onClick, disabled }: {
  icono?: LucideIcon;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-[12.5px] font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-50 [@media(pointer:coarse)]:min-h-10"
    >
      {Icono && <Icono size={14} aria-hidden />}
      {children}
    </button>
  );
}

/** Un «Recuérdamelo» que toca hoy (o se pasó): en su fila de la lista. */
export function PastillaSeguimiento({ titulo, atrasado, className }: { titulo: string; atrasado: boolean; className?: string }) {
  return (
    <span
      title={titulo}
      data-seguimiento
      className={cn(
        'inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[12px] font-medium',
        atrasado ? 'border-destructive/30 text-destructive' : 'border-warning/50 text-warning',
        className,
      )}
    >
      <Bell size={11} className="shrink-0" aria-hidden />
      <span className="truncate">{atrasado ? 'Seguimiento atrasado' : 'Seguimiento hoy'}</span>
    </span>
  );
}
