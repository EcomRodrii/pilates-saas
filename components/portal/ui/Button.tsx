'use client';

import type { ButtonHTMLAttributes } from 'react';
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
// Valores literales del sistema "Tentare Studio App" (portal-app.css) para
// las cuatro variantes. `primary` vivía detrás de `--portal-btn-*` (la marca
// del estudio, como eje aparte); deja de hacerlo por la misma decisión que el
// resto de la paleta: dentro del portal manda el kit y la marca queda para
// acentos. La FORMA sí sigue siendo del tema (`--portal-radius-boton`).
export function Button({ variant = 'primary', size = 'default', style, disabled, loading, children, ...props }: ButtonProps) {
  const small = size === 'small';
  const inactivo = disabled || loading;

  const variants: Record<ButtonVariant, React.CSSProperties> = {
    // `.ap-btn--primario` de portal-app.css, literal: si estas vars siguieran
    // leyéndose (`--portal-btn-bg` la calcula lib/theme-runtime.ts a partir
    // del color del estudio) el CTA principal seguiría saliendo de marca.
    primary: { background: 'var(--ap-tinta, #1A1A1A)', color: '#F1ECE1', border: 'none' },
    secondary: { background: '#EFEDE4', color: '#1A1A1A', border: '1px solid #E5E3DA' },
    ghost: { background: 'transparent', color: '#5A5A52' },
    danger: { background: semantic.danger.soft, color: semantic.danger.text },
  };

  return (
    <button
      disabled={inactivo}
      aria-busy={loading || undefined}
      style={{
        height: small ? 40 : 48,
        padding: small ? '0 16px' : '0 20px',
        // `radioTema.boton` del tema del estudio (lib/theme-runtime.ts) — sin
        // ese campo, cae al 14px de siempre. Solo el tamaño normal lo lee:
        // `small` es un contexto ya compacto (chips/acciones secundarias),
        // no la forma que distingue un tema de otro.
        borderRadius: small ? radius.control : 'var(--portal-radius-boton, 14px)',
        fontWeight: 800,
        fontSize: small ? 12.5 : 14,
        // Sin versalitas: `.ap-btn` del kit no las lleva. En el prototipo las
        // mayúsculas son de las micro-etiquetas (`.ap-label`), no de los CTA.
        letterSpacing: '0.01em',
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
