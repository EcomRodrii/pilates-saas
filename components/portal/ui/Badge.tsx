'use client';

import type { ReactNode } from 'react';
import { useModo } from '@/lib/portal-modo';
import { semantic } from '@/lib/portal-tokens';

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'neutral';

// Un componente para las 7 implementaciones de "badge de estado" que existían
// sueltas (ESTADO_BADGE en reservas, ESTADO_STYLE en progreso, diccionarios
// inline en clases/mi-plan/home...), cada una con su propio diccionario de
// colores repetido.
export function Badge({ variant = 'neutral', children }: { variant?: BadgeVariant; children: ReactNode }) {
  const { t } = useModo();
  const colors: Record<BadgeVariant, { bg: string; fg: string }> = {
    success: { bg: semantic.success.soft, fg: semantic.success.text },
    warning: { bg: semantic.warning.soft, fg: semantic.warning.text },
    danger: { bg: semantic.danger.soft, fg: semantic.danger.text },
    neutral: { bg: t.surface2, fg: t.muted },
  };
  const c = colors[variant];
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 800,
        textTransform: 'uppercase', letterSpacing: '0.03em', padding: '5px 10px', borderRadius: 999,
        background: c.bg, color: c.fg, whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}
