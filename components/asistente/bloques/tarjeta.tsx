'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

// La caja de cada tarjeta del asistente: la misma Card del panel (radio, anillo,
// fondo), un título y «Ver en …» hacia la pantalla donde vive el dato. Sin
// mascota: las tarjetas son datos (y algunas, dinero). Lo vigila la guardia de
// Tenti (VETADOS, «tarjetas del asistente»).

const DESTINOS: [string, string][] = [
  ['/calendario', 'Calendario'], ['/clientas', 'Clientas'], ['/cobros', 'Cobros'], ['/informes', 'Informes'],
  ['/centro-de-control', 'Centro de Control'], ['/dashboard', 'Inicio'],
];

export const destinoDe = (href: string) => DESTINOS.find(([p]) => href === p || href.startsWith(`${p}?`) || href.startsWith(`${p}/`))?.[1] ?? 'el panel';

export function Tarjeta({ titulo, href, extra, pie, children, tipo }: {
  titulo: ReactNode;
  href?: string | null;
  /** Al lado del título (un total, un importe). */
  extra?: ReactNode;
  pie?: ReactNode;
  children: ReactNode;
  tipo: string;
}) {
  return (
    <section
      data-slot="card"
      data-bloque={tipo}
      className="overflow-hidden rounded-3xl bg-card ring-1 ring-black/[0.06] shadow-[0_1px_3px_rgba(0,0,0,0.04)] dark:ring-white/[0.08]"
    >
      <header className="flex items-center justify-between gap-3 px-4 pt-3.5 pb-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <h3 className="truncate text-[13.5px] font-semibold text-foreground">{titulo}</h3>
          {extra}
        </div>
        {href && (
          <Link
            href={href}
            className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[12.5px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Ver en {destinoDe(href)}
            <ArrowRight size={13} aria-hidden="true" />
          </Link>
        )}
      </header>
      {children}
      {pie && <p className="border-t border-border px-4 py-2.5 text-[12.5px] text-muted-foreground">{pie}</p>}
    </section>
  );
}

/** Una lista de filas con divisor, dentro de la tarjeta. */
export function Filas({ children, className }: { children: ReactNode; className?: string }) {
  return <ul className={cn('divide-y divide-border border-t border-border', className)}>{children}</ul>;
}

/** «y 12 más» cuando la lista viene recortada. */
export function quedanMas(total: number, vistas: number, donde: string): string | null {
  const n = total - vistas;
  return n > 0 ? `Y ${n} más en ${donde}.` : null;
}
