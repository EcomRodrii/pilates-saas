'use client';

import type { HTMLAttributes } from 'react';

// Valores literales del sistema "Tentare Studio App" (portal-app.css,
// `.ap-card`) — antes venían de `useModo()`, la paleta del diseño anterior ya
// sustituido ("Tentare App Cliente v2"). El radio pasa de los 20px de aquel
// sistema a los 16px exactos de `.ap-card`.
export function Card({ style, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      style={{
        background: '#FFFFFF',
        // --portal-card-border/-shadow los calcula lib/theme-runtime.ts según
        // cardStyle (flat/elevated/bordered). El estilo 'flat' no declara
        // estas vars a propósito, así que el fallback (el borde exacto del
        // diseño) es el que se aplica.
        border: 'var(--portal-card-border, 1px solid #E5E3DA)',
        boxShadow: 'var(--portal-card-shadow, none)',
        // `radioTema.card` del tema del estudio (lib/theme-runtime.ts) — sin
        // ese campo, cae al radio exacto de `.ap-card`.
        borderRadius: 'var(--portal-radius-card, 16px)',
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}
