'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

// Estado vacío estándar del panel. Extraído del patrón que Equipo y
// Sustituciones tenían copiado carácter por carácter (auditoría 2026-08-20:
// ~90 estados vacíos con 6 implementaciones distintas y ninguna primitiva).
//
// Dos registros:
// - Por defecto: caja punteada + tile de marca + título + CTA. Para el vacío
//   principal de una pantalla o lista.
// - `compacto`: sin caja ni tile, icono discreto + texto. Para vacíos dentro
//   de una card o widget, donde una caja punteada dentro de otra caja hace
//   ruido. Un párrafo gris sigue siendo válido para huecos de una línea —
//   este componente no pretende decorar los ~60 vacíos menores del panel.
//
// `ilustracion` sustituye al tile cuando el momento lo merece (primer uso,
// error de pantalla completa) — no para cada lista vacía: vacío ≠ error, y un
// SaaS profesional no necesita una ilustración por empty state.
function EmptyState({
  icono: Icono,
  ilustracion,
  titulo,
  descripcion,
  cta,
  compacto = false,
  className,
}: {
  icono?: LucideIcon;
  ilustracion?: { src: string; alt?: string };
  titulo: string;
  descripcion?: string;
  cta?: { label: string; onClick?: () => void; href?: string; icono?: LucideIcon };
  compacto?: boolean;
  className?: string;
}) {
  const IconoCta = cta?.icono;
  const botonCta = cta && (
    <span className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand text-brand-foreground text-[13px] font-bold">
      {IconoCta && <IconoCta size={15} aria-hidden="true" />} {cta.label}
    </span>
  );

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compacto
          ? 'py-10'
          : 'py-20 rounded-2xl border border-dashed border-border bg-card',
        className,
      )}
    >
      {ilustracion ? (
        // SVG decorativo local — mismo criterio que primeros-pasos: next/image no optimiza SVG.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={ilustracion.src}
          alt={ilustracion.alt ?? ''}
          className="w-32 h-32 mb-4"
          loading="lazy"
        />
      ) : Icono ? (
        compacto ? (
          <Icono size={20} className="text-muted-foreground/70 mb-2.5" aria-hidden="true" />
        ) : (
          <div className="w-14 h-14 rounded-2xl bg-brand/10 flex items-center justify-center mb-4">
            <Icono size={26} className="text-brand-medio" aria-hidden="true" />
          </div>
        )
      ) : null}

      <p className={cn('text-foreground', compacto ? 'text-[14px] font-semibold' : 'text-[16px] font-bold')}>
        {titulo}
      </p>
      {descripcion && (
        <p className={cn('text-[13px] text-muted-foreground mt-1 max-w-xs', cta && 'mb-5')}>
          {descripcion}
        </p>
      )}
      {cta &&
        (cta.href ? (
          <Link href={cta.href}>{botonCta}</Link>
        ) : (
          <button type="button" onClick={cta.onClick}>
            {botonCta}
          </button>
        ))}
    </div>
  );
}

export { EmptyState };
