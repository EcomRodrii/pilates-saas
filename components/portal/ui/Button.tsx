'use client';

import type { ButtonHTMLAttributes } from 'react';
import { useModo } from '@/lib/portal-modo';
import { radius, semantic } from '@/lib/portal-tokens';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'default' | 'small';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

// Altura mínima 48px (por debajo de eso, ~44px cumple el mínimo táctil de
// Apple HIG con algo de margen). `small` (40px) es la única variante que baja
// de 48, y solo para contextos ya espaciosos — nunca el CTA principal.
export function Button({ variant = 'primary', size = 'default', style, disabled, children, ...props }: ButtonProps) {
  const { t } = useModo();
  const small = size === 'small';

  const variants: Record<ButtonVariant, React.CSSProperties> = {
    primary: { background: 'var(--portal-brand)', color: 'var(--portal-brand-foreground)' },
    secondary: { background: t.surface2, color: t.ink, border: `1px solid ${t.line}` },
    ghost: { background: 'transparent', color: t.muted },
    danger: { background: semantic.danger.soft, color: semantic.danger.text },
  };

  return (
    <button
      disabled={disabled}
      style={{
        height: small ? 40 : 48,
        padding: small ? '0 16px' : '0 20px',
        borderRadius: small ? radius.control : 14,
        fontWeight: 800,
        fontSize: small ? 12.5 : 14,
        textTransform: 'uppercase',
        letterSpacing: '0.02em',
        border: 'none',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        transition: 'transform .12s ease, opacity .12s ease',
        ...variants[variant],
        ...style,
      }}
      {...props}
    >
      {children}
    </button>
  );
}
