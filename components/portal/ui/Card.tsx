'use client';

import type { HTMLAttributes } from 'react';
import { useModo } from '@/lib/portal-modo';
import { radius } from '@/lib/portal-tokens';

// Radio único de 20px — sustituye los 5 radios distintos (18/20/22/24/26px)
// que el mismo concepto de tarjeta usaba en 9 archivos distintos.
export function Card({ style, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  const { t } = useModo();
  return (
    <div
      style={{
        background: t.surface,
        // --portal-card-border/-shadow los calcula lib/theme-runtime.ts según
        // cardStyle (flat/elevated/bordered). El estilo 'flat' no declara
        // estas vars a propósito, así que el fallback (el borde de siempre,
        // que depende del modo claro/oscuro) es el que se aplica.
        border: `var(--portal-card-border, 1px solid ${t.line})`,
        boxShadow: 'var(--portal-card-shadow, none)',
        // `radioTema.card` del tema del estudio (lib/theme-runtime.ts) — sin
        // ese campo, cae al radio de siempre.
        borderRadius: `var(--portal-radius-card, ${radius.card}px)`,
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}
