'use client';

import { useId, type InputHTMLAttributes } from 'react';

// Literal del paquete (`components/ui/Input.tsx`). `aria-invalid` +
// `aria-describedby` ya venían resueltos en el diseño (handoff §K.9).
export function Input({
  label, error, hint, ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string }) {
  const id = useId();
  return (
    <div>
      <label
        htmlFor={id}
        className="t-meta"
        style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 700, margin: '0 0 var(--s-1) 2px' }}
      >
        {label}
      </label>
      <input
        id={id}
        className="input"
        aria-invalid={!!error || undefined}
        aria-describedby={error ? id + '-e' : undefined}
        {...rest}
      />
      {error
        ? <p id={id + '-e'} role="alert" className="field-error">{error}</p>
        : hint ? <p className="t-meta" style={{ margin: 'var(--s-1) 0 0 2px' }}>{hint}</p> : null}
    </div>
  );
}
