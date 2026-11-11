// La baldosa de app: la pieza que hace que «Apps e integraciones» se sienta un
// producto y no una lista. Una baldosa redondeada con un halo de color suave
// detrás del glifo — igual para todas, para que la tienda se lea como un juego
// de piezas y no como veinte iconos sueltos.
//
//   · `glifo`  → una app de Tentare: un disco de color con el icono dentro y
//                el halo del mismo color detrás.
//   · `logo`   → una integración de otra marca: su logo real, centrado en la
//                baldosa, con el halo del color de su marca.
//
// Todo sale de tokens (`--cat-*`, `--t-*`): en oscuro la baldosa toma `--card`
// y el halo se mezcla con él, sin un solo hex suelto.

import type { CSSProperties, ElementType, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type TonoApp = 'azul' | 'magenta' | 'verde' | 'indigo' | 'ambar' | 'teal' | 'gris';

const COLOR: Record<TonoApp, string> = {
  azul: 'var(--t-blue-500)',
  magenta: 'var(--t-magenta-500)',
  verde: 'var(--cat-2)',
  indigo: 'var(--cat-5)',
  ambar: 'var(--cat-9)',
  teal: 'var(--cat-3)',
  gris: 'var(--muted-foreground)',
};

const TAMANOS = {
  sm: { baldosa: 'size-10 rounded-[13px]', disco: 'size-6 rounded-full', glifo: 13, logo: 20, halo: 'size-6' },
  md: { baldosa: 'size-14 rounded-[18px]', disco: 'size-8 rounded-full', glifo: 17, logo: 26, halo: 'size-9' },
  lg: { baldosa: 'size-[72px] rounded-[22px]', disco: 'size-10 rounded-full', glifo: 21, logo: 32, halo: 'size-11' },
  xl: { baldosa: 'size-24 rounded-[28px]', disco: 'size-14 rounded-full', glifo: 28, logo: 44, halo: 'size-16' },
} as const;

export type TamanoApp = keyof typeof TAMANOS;

export function IconoApp({ tono = 'azul', tamano = 'md', glifo: Glifo, logo, apagada, className }: {
  tono?: TonoApp;
  tamano?: TamanoApp;
  /** Un icono de lucide para las apps de Tentare. */
  glifo?: ElementType;
  /** El logo de una marca externa (ya con su tamaño propio). */
  logo?: (px: number) => ReactNode;
  /** Lo que aún no se puede encender: sin halo, en gris. */
  apagada?: boolean;
  className?: string;
}) {
  const t = TAMANOS[tamano];
  const color = COLOR[apagada ? 'gris' : tono];
  const halo: CSSProperties = { backgroundColor: `color-mix(in srgb, ${color} ${apagada ? 0 : 42}%, transparent)` };
  return (
    <span
      aria-hidden
      className={cn(
        'relative isolate flex shrink-0 items-center justify-center overflow-hidden border border-border bg-card',
        // La luz de arriba: un brillo blanco muy tenue que da volumen sin ser un degradado de moda.
        'shadow-[0_1px_0_0_color-mix(in_srgb,white_70%,transparent)_inset,0_6px_14px_-10px_color-mix(in_srgb,var(--foreground)_40%,transparent)]',
        t.baldosa,
        className,
      )}
    >
      <span className={cn('absolute rounded-full blur-xl', t.halo)} style={halo} />
      {logo ? (
        <span className="relative">{logo(t.logo)}</span>
      ) : Glifo ? (
        <span
          className={cn('relative flex items-center justify-center text-white', t.disco)}
          style={{
            backgroundImage: apagada
              ? undefined
              : `linear-gradient(150deg, color-mix(in srgb, ${color} 78%, white), ${color})`,
            backgroundColor: apagada ? 'var(--muted)' : undefined,
            color: apagada ? 'var(--muted-foreground)' : undefined,
            boxShadow: apagada
              ? undefined
              : `0 1px 0 0 color-mix(in srgb, white 55%, transparent) inset, 0 8px 16px -8px ${color}`,
          }}
        >
          <Glifo size={t.glifo} strokeWidth={2.1} />
        </span>
      ) : null}
    </span>
  );
}
