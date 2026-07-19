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
      style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: radius.card, ...style }}
      {...props}
    >
      {children}
    </div>
  );
}
