'use client';

import { forwardRef, type InputHTMLAttributes } from 'react';
import { useModo } from '@/lib/portal-modo';
import { semantic } from '@/lib/portal-tokens';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

// fontSize fijo en 16px — por debajo de eso iOS hace zoom automático al
// enfocar el campo. Antes el 100% de los inputs del portal usaban 14px.
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ error, style, ...props }, ref) {
  const { t } = useModo();
  return (
    <input
      ref={ref}
      style={{
        width: '100%', height: 52, borderRadius: 14, padding: '0 16px', fontSize: 16,
        border: `1.5px solid ${error ? semantic.danger.text : t.line}`,
        background: t.surface, color: t.ink, outline: 'none',
        ...style,
      }}
      {...props}
    />
  );
});
