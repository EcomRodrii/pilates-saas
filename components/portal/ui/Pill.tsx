'use client';

import type { ButtonHTMLAttributes } from 'react';

interface PillProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

// Filtro/tab suelto (categoría de vídeo, tipo de clase...). Altura mínima
// 44px — antes 28-32px en la mayoría de sus 8 implementaciones sueltas.
//
// ⚠️ COLOR DEL KIT LITERAL (`--ap-*`), no `useModo()`. El activo replica el
// filtro del CHEATSHEET ("activo: borde #4F8A5B, bg #EAF0E7, texto #2E5A3A"),
// no `--portal-brand`: el acuerdo es que el portal se vea IDÉNTICO al
// prototipo, y ahí el filtro activo es verde del kit. El inactivo usa el
// borde y el secundario del kit sobre la superficie de tarjeta.
export function Pill({ active = false, style, children, ...props }: PillProps) {
  return (
    <button
      style={{
        flexShrink: 0, minHeight: 44, display: 'flex', alignItems: 'center', padding: '0 16px',
        borderRadius: 999, fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap',
        border: `1px solid ${active ? '#4F8A5B' : 'var(--ap-borde)'}`,
        background: active ? 'var(--ap-verde-suave)' : 'var(--ap-card)',
        color: active ? 'var(--ap-verde-tinta)' : 'var(--ap-sec)',
        ...style,
      }}
      {...props}
    >
      {children}
    </button>
  );
}
