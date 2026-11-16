'use client';

import { useId } from 'react';
import type { IntervaloUi } from '@/lib/billing/intervalo-ui';

// Mensual / Anual. Es un RADIOGROUP (no dos botones sueltos): un lector de
// pantalla dice «Periodo de facturación, Mensual, 1 de 2» y las flechas mueven
// entre las dos opciones, como un grupo de radios nativo. Lo comparten /precios
// y /suscripcion; solo se pinta cuando el pago anual está disponible de verdad.

export function SelectorIntervalo({
  valor,
  onCambio,
  /** «Dos meses gratis»: el texto de la opción anual (lo decide quien lo pinta). */
  etiquetaAnual = 'Anual · 2 meses gratis',
  /** Sobre fondo oscuro. */
  oscuro = false,
  className = '',
}: {
  valor: IntervaloUi;
  onCambio: (i: IntervaloUi) => void;
  etiquetaAnual?: string;
  oscuro?: boolean;
  className?: string;
}) {
  const uid = useId();
  const opciones: { id: IntervaloUi; texto: string }[] = [
    { id: 'mensual', texto: 'Mensual' },
    { id: 'anual', texto: etiquetaAnual },
  ];

  function alTeclado(e: React.KeyboardEvent, i: IntervaloUi) {
    const otro: IntervaloUi = i === 'mensual' ? 'anual' : 'mensual';
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      onCambio(otro);
      document.getElementById(`${uid}-${otro}`)?.focus();
    }
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onCambio(i); }
  }

  return (
    <div
      role="radiogroup"
      aria-label="Periodo de facturación"
      className={`inline-flex rounded-full border p-1 ${oscuro ? 'border-white/20' : 'border-border bg-muted/40'} ${className}`}
    >
      {opciones.map((o) => {
        const activa = o.id === valor;
        return (
          <button
            key={o.id}
            id={`${uid}-${o.id}`}
            type="button"
            role="radio"
            aria-checked={activa}
            tabIndex={activa ? 0 : -1}
            onClick={() => onCambio(o.id)}
            onKeyDown={(e) => alTeclado(e, o.id)}
            className={`rounded-full px-4 py-1.5 text-[13.5px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand motion-reduce:transition-none ${
              activa
                ? 'bg-foreground text-background shadow-sm'
                : oscuro ? 'text-white/70 hover:text-white' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {o.texto}
          </button>
        );
      })}
    </div>
  );
}
