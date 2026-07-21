import type { CSSProperties } from 'react';

// Logo de Tentare en SVG vectorial (hoy en /public solo hay PNG raster).
// El isotipo real es una "t" orgánica con degradado metálico teal→magenta;
// esta es una recreación geométrica limpia y escalable — nítida a cualquier
// tamaño y con el trazo animable. La versión definitiva del isotipo orgánico
// debería venir del archivo vectorial original del usuario si se quiere
// fidelidad total (ver nota en el plan). Para nav, footer y favicon, esta
// marca geométrica cumple.

const GRAD_ID = 'tentareBrandGrad';

/** Isotipo: teja redondeada con degradado de marca y una "t" en blanco. */
export function LogoMark({ size = 30, style }: { size?: number; style?: CSSProperties }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      role="img"
      aria-label="Tentare"
      style={style}
    >
      <defs>
        <linearGradient id={GRAD_ID} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#12A6B4" />
          <stop offset="0.5" stopColor="#7C4BA0" />
          <stop offset="1" stopColor="#D74A93" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${GRAD_ID})`} />
      {/* "t" minúscula: asta + travesaño + base curva */}
      <path
        d="M16.4 7.6v3.0M12.8 12.0h7.0M16.4 10.6v9.1c0 2.2 1.3 3.5 3.4 3.5"
        stroke="#fff"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

/** Isotipo + wordmark "tentare". */
export function LogoWordmark({ size = 30, style }: { size?: number; style?: CSSProperties }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 11, ...style }}>
      <LogoMark size={size} />
      <span
        style={{
          fontFamily: 'var(--mkt-font)',
          fontWeight: 800,
          fontSize: size * 0.63,
          letterSpacing: '-0.02em',
          color: 'var(--mkt-text)',
          lineHeight: 1,
        }}
      >
        tentare
      </span>
    </span>
  );
}
