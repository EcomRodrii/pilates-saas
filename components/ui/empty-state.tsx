'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Escena, type NombreEscena } from '@/components/ilustraciones/escenas';
import { useShellNuevo } from '@/lib/estudio/panel-nuevo-cliente';

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
  escena: escenaPedida,
  titulo,
  descripcion,
  cta,
  ctaSecundaria,
  compacto = false,
  className,
}: {
  icono?: LucideIcon;
  ilustracion?: { src: string; alt?: string };
  /**
   * Una de las ilustraciones propias de `components/ilustraciones/escenas.tsx` (18-nov-2026). Con
   * ella el vacío pasa a una tarjeta con borde sólido y un botón principal oscuro, más una
   * acción secundaria opcional: un vacío con intención, no una caja punteada. ⚠️ Nunca en
   * pantallas de dinero con error ni junto a texto redactado por un modelo.
   */
  escena?: NombreEscena;
  titulo: string;
  descripcion?: string;
  cta?: { label: string; onClick?: () => void; href?: string; icono?: LucideIcon };
  /** Solo con `escena`: la acción de al lado (p. ej. «Importar»). Más discreta que la principal. */
  ctaSecundaria?: { label: string; onClick?: () => void; href?: string };
  compacto?: boolean;
  className?: string;
}) {
  // Las escenas propias (y el botón oscuro) son del marco a sangre: sin `SHELL_NUEVO`, el vacío es el de siempre.
  const shell = useShellNuevo();
  const escena = shell ? escenaPedida : undefined;
  const IconoCta = cta?.icono;
  const botonCta = cta && (
    <span className={cn(
      'inline-flex items-center gap-2 px-4 py-2.5 text-[13px] font-bold',
      escena
        ? 'rounded-full bg-[var(--t-surface-inverse)] text-[var(--t-text-inverse)] max-md:flex max-md:h-[54px] max-md:w-full max-md:items-center max-md:justify-center max-md:text-[17px] max-md:font-semibold'
        : 'rounded-xl bg-brand text-brand-foreground',
    )}>
      {IconoCta && <IconoCta size={15} aria-hidden="true" />} {cta.label}
    </span>
  );

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compacto
          ? 'py-10'
          : escena
            ? 'py-16 rounded-2xl border border-border bg-card max-md:border-0 max-md:bg-transparent max-md:px-6'
            : 'py-20 rounded-2xl border border-dashed border-border bg-card',
        className,
      )}
    >
      {escena && !compacto ? (
        <Escena nombre={escena} className="mb-4" />
      ) : ilustracion ? (
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

      <p className={cn('text-foreground', compacto ? 'text-[14px] font-semibold' : 'text-[16px] font-bold', escena && 'max-md:text-[20px] max-md:font-semibold')}>
        {titulo}
      </p>
      {descripcion && (
        <p className={cn('text-[13px] text-muted-foreground mt-1 max-w-xs', cta && 'mb-5', escena && 'max-md:text-[16px] max-md:mt-2 max-md:mb-8')}>
          {descripcion}
        </p>
      )}
      {(cta || (escena && ctaSecundaria)) && (
        <div className={cn('flex flex-wrap items-center justify-center gap-2', escena && 'max-md:w-full max-md:flex-col')}>
          {cta &&
            (cta.href ? (
              <Link href={cta.href} className={escena ? 'max-md:w-full' : undefined}>{botonCta}</Link>
            ) : (
              <button type="button" onClick={cta.onClick} className={escena ? 'max-md:w-full' : undefined}>
                {botonCta}
              </button>
            ))}
          {escena && ctaSecundaria && (() => {
            const clases = 'inline-flex items-center rounded-full border border-border bg-card px-4 py-2.5 text-[13px] font-semibold text-foreground hover:bg-muted transition-colors';
            return ctaSecundaria.href
              ? <Link href={ctaSecundaria.href} className={clases}>{ctaSecundaria.label}</Link>
              : <button type="button" onClick={ctaSecundaria.onClick} className={clases}>{ctaSecundaria.label}</button>;
          })()}
        </div>
      )}
    </div>
  );
}

export { EmptyState };
