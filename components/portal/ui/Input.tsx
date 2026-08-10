'use client';

import { forwardRef, useId, type InputHTMLAttributes } from 'react';
import { useModo } from '@/lib/portal-modo';
import { semantic } from '@/lib/portal-tokens';
import { micro } from '@/lib/portal-design';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
  /**
   * Rótulo VISIBLE encima del campo.
   *
   * ⚠️ No es adorno. Sin él, el único nombre del campo es el `placeholder`, y
   * el placeholder desaparece en cuanto hay valor: en "Mis datos" se veía una
   * columna de cajas con `Lamine`, `RE`, un correo y un teléfono, sin una sola
   * palabra que dijera cuál era el apellido y cuál el nombre. Repasar tus
   * propios datos era imposible. Además, un `placeholder` no es un nombre
   * accesible para un lector de pantalla.
   */
  label?: string;
}

// fontSize fijo en 16px — por debajo de eso iOS hace zoom automático al
// enfocar el campo. Antes el 100% de los inputs del portal usaban 14px.
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { error, label, style, id, ...props }, ref,
) {
  const { t } = useModo();
  const auto = useId();
  const inputId = id ?? auto;

  const campo = (
    <input
      ref={ref}
      id={inputId}
      style={{
        width: '100%', height: 52, borderRadius: 14, padding: '0 16px', fontSize: 16,
        // ⚠️ `width: 100%` no basta: `input[type=date]` trae de fábrica un
        // ancho intrínseco (el que necesita su selector nativo) y en iOS se
        // salía por la derecha de la hoja. `min-width: 0` le quita el suelo y
        // `max-width` pone el techo.
        minWidth: 0, maxWidth: '100%',
        border: `1.5px solid ${error ? semantic.danger.text : t.line}`,
        background: t.surface, color: t.ink, outline: 'none',
        ...style,
      }}
      {...props}
    />
  );

  if (!label) return campo;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <label htmlFor={inputId} style={{ ...micro(9.5, 0.24, 600), color: t.micro, paddingLeft: 4 }}>
        {label}
      </label>
      {campo}
    </div>
  );
});
