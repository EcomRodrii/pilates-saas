// ─────────────────────────────────────────────────────────────────────────────
// El color de la home nueva (panel nuevo, 14-oct-2026).
//
// El fundador, viendo la primera versión: «mira la home de Bonsai: llamativa,
// muy intuitiva, colores». La de Bonsai se lee por color: cada cifra con su
// tono, iconos saturados, barras que se ponen rojas cuando algo va mal, la
// gráfica rellena y los botones de un azul que se ve desde lejos.
//
// Aquí, lo mismo con los colores de Tentare y sin inventar ninguno:
//   · el azul y el magenta del logo (`--t-blue-500`, `--t-magenta-500`);
//   · el verde y el índigo de la paleta categórica (`--cat-2`, `--cat-5`), que
//     ya tienen su versión para oscuro;
//   · el degradado del logo (700 → 700, texto blanco por encima de 5,5:1) para
//     la acción principal de cada tarjeta.
// El icono va del color de la tarjeta (`--card`) sobre el tono sólido: blanco en
// claro y oscuro en oscuro, donde los tonos se aclaran.
// ─────────────────────────────────────────────────────────────────────────────

import type { CSSProperties, ElementType, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type Tono = 'azul' | 'magenta' | 'verde' | 'indigo';

export const TONOS: Record<Tono, string> = {
  azul: 'var(--t-blue-500)',
  magenta: 'var(--t-magenta-500)',
  verde: 'var(--cat-2)',
  indigo: 'var(--cat-5)',
};

/** La acción principal de una tarjeta de la home nueva: el degradado del logo. */
export const BOTON_VIVO =
  'inline-flex items-center justify-center gap-1.5 rounded-full bg-[linear-gradient(135deg,var(--t-blue-700),var(--t-magenta-700))] font-semibold text-white shadow-[0_6px_16px_-8px_var(--t-magenta-700)] transition-[filter,transform] hover:brightness-110 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50';

/** El degradado del logo, para barras y progresos. */
export const DEGRADADO_LOGO = 'linear-gradient(90deg, var(--t-blue-500), var(--t-magenta-500))';

/** Una baldosa de color con su icono, como los iconos de color de Bonsai. */
export function Baldosa({ tono, Icono, tamano = 'md' }: { tono: Tono; Icono: ElementType; tamano?: 'sm' | 'md' }) {
  const c = TONOS[tono];
  return (
    <span
      aria-hidden
      className={cn('flex shrink-0 items-center justify-center', tamano === 'sm' ? 'size-8 rounded-[10px]' : 'size-10 rounded-xl')}
      style={{ backgroundColor: c, color: 'var(--card)', boxShadow: `0 8px 18px -10px ${c}` }}
    >
      <Icono size={tamano === 'sm' ? 15 : 18} strokeWidth={2.2} />
    </span>
  );
}

/** Fondo de una tarjeta teñida de su tono: blanca arriba a la izquierda y de color hacia la esquina. */
export function fondoTenido(tono: Tono, fuerza = 16): CSSProperties {
  const c = TONOS[tono];
  return {
    backgroundImage: `linear-gradient(135deg, var(--card) 25%, color-mix(in srgb, ${c} ${fuerza}%, var(--card)) 100%)`,
    borderColor: `color-mix(in srgb, ${c} 26%, var(--border))`,
  };
}

/** La cabecera de una tarjeta: baldosa de color, título y, a la derecha, lo que sea. */
export function CabeceraTarjeta({ tono, Icono, titulo, id, derecha, sub }: {
  tono: Tono; Icono: ElementType; titulo: ReactNode; id?: string; derecha?: ReactNode; sub?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <Baldosa tono={tono} Icono={Icono} tamano="sm" />
      <div className="min-w-0 flex-1">
        <h2 id={id} className="text-[16px] font-semibold leading-tight text-foreground">{titulo}</h2>
        {sub && <p className="mt-0.5 text-[12.5px] text-muted-foreground">{sub}</p>}
      </div>
      {derecha}
    </div>
  );
}

/**
 * El color de una barra de ocupación, como Bonsai: roja cuando va floja, ámbar
 * a medias y verde cuando se llena. Se lee de un vistazo sin mirar la cifra.
 */
export function colorDeOcupacion(pct: number): string {
  if (pct < 35) return 'var(--destructive)';
  if (pct < 70) return 'var(--warning)';
  return 'var(--success)';
}
