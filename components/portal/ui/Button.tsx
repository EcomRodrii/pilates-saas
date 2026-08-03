'use client';

import type { ButtonHTMLAttributes } from 'react';
import { useModo } from '@/lib/portal-modo';
import { radius, semantic } from '@/lib/portal-tokens';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'default' | 'small';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Deshabilita y pinta un spinner delante del contenido — el texto se
   *  mantiene (a diferencia de `disabled` sin más, que solo atenúa). Antes
   *  cada pantalla gestionaba esto a mano con su propio estado `enviando`
   *  (ver hoja-reserva.tsx); esta prop lo centraliza para poder mantener el
   *  botón en su sitio en vez de sustituirlo por un aviso aparte. */
  loading?: boolean;
}

// Altura mínima 48px (por debajo de eso, ~44px cumple el mínimo táctil de
// Apple HIG con algo de margen). `small` (40px) es la única variante que baja
// de 48, y solo para contextos ya espaciosos — nunca el CTA principal.
export function Button({ variant = 'primary', size = 'default', style, disabled, loading, children, ...props }: ButtonProps) {
  const { t } = useModo();
  const small = size === 'small';
  const inactivo = disabled || loading;

  const variants: Record<ButtonVariant, React.CSSProperties> = {
    // Las 3 vars --portal-btn-* las calcula lib/theme-runtime.ts según
    // buttonStyle (solid/outline/soft) del tema del estudio; el fallback
    // reproduce el look de siempre si el tema no las declara.
    primary: {
      background: 'var(--portal-btn-bg, var(--portal-brand))',
      color: 'var(--portal-btn-fg, var(--portal-brand-foreground))',
      border: 'var(--portal-btn-border, none)',
    },
    secondary: { background: t.surface2, color: t.ink, border: `1px solid ${t.line}` },
    ghost: { background: 'transparent', color: t.muted },
    danger: { background: semantic.danger.soft, color: semantic.danger.text },
  };

  return (
    <button
      disabled={inactivo}
      aria-busy={loading || undefined}
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
        cursor: inactivo ? 'default' : 'pointer',
        opacity: disabled ? 0.4 : loading ? 0.75 : 1,
        transition: 'transform .12s ease, opacity .12s ease',
        ...variants[variant],
        ...style,
      }}
      {...props}
    >
      {loading && (
        <span
          aria-hidden
          className="animate-spin"
          style={{
            width: 14, height: 14, borderRadius: 999, display: 'inline-block', flexShrink: 0,
            border: '2px solid currentColor', borderTopColor: 'transparent', opacity: 0.8,
          }}
        />
      )}
      {children}
    </button>
  );
}
