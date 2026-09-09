'use client';

import type { ReactNode } from 'react';

/**
 * Una opción que se toca para elegirla. La pieza de la que está hecha casi toda
 * la valoración.
 *
 * Por qué una tarjeta a lo ancho y no un radio ni un desplegable: el encargo
 * pide «opciones visuales, chips, cards seleccionables» y una decisión por
 * pantalla. Un `<select>` en móvil abre la rueda nativa, tapa la pregunta y
 * obliga a confirmar — tres gestos para lo que aquí es uno.
 *
 * ⚠️ Es un `<button>` de verdad, con `aria-pressed`. Un `<div onClick>` no lo
 * alcanza el teclado, no lo anuncia el lector de pantalla y no responde a la
 * barra espaciadora. Aquí es `aria-pressed` y no `aria-checked` porque no hay
 * `role="radio"` ni grupo declarado: son botones que recuerdan si están
 * pulsados, y ese es exactamente el estado que `aria-pressed` describe — el
 * mismo criterio, y el mismo par de errores, que ya documenta `student.css`
 * con `.day` y `.pill`.
 */
export function Opcion({ seleccionada, onClick, children, icono, disabled }: {
  seleccionada: boolean;
  onClick: () => void;
  children: ReactNode;
  icono?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={seleccionada}
      className="card card--pad-lg row"
      style={{
        width: '100%', textAlign: 'left', gap: 'var(--s-3)',
        cursor: disabled ? 'default' : 'pointer',
        // El borde es lo que cambia, no el fondo entero: rellenar la tarjeta de
        // color hace que cinco opciones marcadas parezcan cinco avisos.
        borderColor: seleccionada ? 'var(--accent)' : 'var(--border)',
        borderWidth: seleccionada ? 1.5 : 1,
        background: seleccionada ? 'var(--accent-soft)' : 'var(--card)',
        color: seleccionada ? 'var(--accent-soft-foreground)' : 'var(--foreground)',
        // Sutil y rápido: el toque tiene que confirmarse, no celebrarse.
        transition: 'background .18s var(--ease), border-color .18s var(--ease), transform .12s var(--ease)',
        font: 'inherit', fontSize: 'var(--t-body)', fontWeight: 700,
      }}
    >
      {icono && <span aria-hidden className="no-shrink" style={{ display: 'flex' }}>{icono}</span>}
      <span style={{ flex: 1, minWidth: 0 }}>{children}</span>
      {/* La marca de elegida. Ocupa sitio SIEMPRE (aunque esté vacía) para que
          la línea de texto no se desplace al marcarla — el salto de un píxel
          multiplicado por diez opciones es lo que hace que una lista «baile». */}
      <span
        aria-hidden
        className="no-shrink"
        style={{
          width: 20, height: 20, borderRadius: 'var(--radius-pill)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: seleccionada ? 'var(--accent)' : 'transparent',
          border: seleccionada ? 'none' : '1.5px solid var(--border-strong)',
          color: '#fff', fontSize: 'var(--t-meta)', fontWeight: 800,
          transition: 'background .18s, border-color .18s',
        }}
      >
        {seleccionada ? '✓' : ''}
      </span>
    </button>
  );
}
