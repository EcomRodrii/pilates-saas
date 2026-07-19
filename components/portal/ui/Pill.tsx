'use client';

import type { ButtonHTMLAttributes } from 'react';
import { useModo } from '@/lib/portal-modo';

interface PillProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

// Filtro/tab suelto (categoría de vídeo, tipo de clase...). Altura mínima
// 44px — antes 28-32px en la mayoría de sus 8 implementaciones sueltas.
export function Pill({ active = false, style, children, ...props }: PillProps) {
  const { t } = useModo();
  return (
    <button
      style={{
        flexShrink: 0, minHeight: 44, display: 'flex', alignItems: 'center', padding: '0 16px',
        borderRadius: 999, fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap',
        border: `1px solid ${active ? 'var(--portal-brand)' : t.line}`,
        background: active ? 'var(--portal-brand)' : t.surface2,
        color: active ? 'var(--portal-brand-foreground)' : t.muted,
        ...style,
      }}
      {...props}
    >
      {children}
    </button>
  );
}
