import type { ButtonHTMLAttributes, ReactNode } from 'react';

// Literal del paquete (`components/ui/Button.tsx`). Las clases (.btn, .btn--*)
// las define `student.css`, así que aquí no hay ni un estilo en línea salvo el
// spinner.
type Variante = 'primary' | 'secondary' | 'ghost' | 'danger' | 'light';

export function Button({
  variant = 'primary', size, full, loading, children, className = '', ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variante; size?: 'sm'; full?: boolean; loading?: boolean; children: ReactNode;
}) {
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || loading}
      aria-busy={loading || undefined}
      className={['btn', 'btn--' + variant, size ? 'btn--' + size : '', full ? 'btn--full' : '', className].filter(Boolean).join(' ')}
    >
      {loading && (
        <span aria-hidden style={{ width: 14, height: 14, border: '2px solid currentColor', borderRightColor: 'transparent', borderRadius: 99, animation: 'apSpin .7s linear infinite' }} />
      )}
      {/* «Un momento…» es el copy exacto del handoff §G para el estado
          `submitting`: mientras el servidor decide, el botón no promete nada. */}
      {loading ? 'Un momento…' : children}
    </button>
  );
}
