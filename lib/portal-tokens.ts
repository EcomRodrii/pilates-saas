// Design tokens del portal de socias — la escala de la que cuelgan todos los
// componentes de components/portal/ui/*. Antes cada pantalla decidía sus
// propios tamaños de fuente, paddings y radios; esto es el único lugar del
// que se eligen ahora. No sustituye lib/portal-modo.tsx (colores de fondo/
// superficie/texto por día-noche) ni lib/portal-theme.tsx (color de marca
// por estudio) — los complementa con tipografía, espaciado, radio y color
// de estado semántico.
import type { CSSProperties } from 'react';

export const typography = {
  label: { fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' } as CSSProperties,
  caption: { fontSize: 12.5, fontWeight: 500 } as CSSProperties,
  body: { fontSize: 14, fontWeight: 500 } as CSSProperties,
  bodyStrong: { fontSize: 15, fontWeight: 700 } as CSSProperties,
  headline: { fontSize: 17, fontWeight: 800 } as CSSProperties,
  title: { fontSize: 20, fontWeight: 800 } as CSSProperties,
  pageTitle: { fontSize: 24, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '-0.01em' } as CSSProperties,
  heroStat: { fontSize: 32, fontWeight: 800 } as CSSProperties,
} as const;

// Escala de espaciado — todo padding/gap/margin del portal se elige de aquí.
export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 6: 24, 8: 32, 12: 48 } as const;

// Tres roles de radio, no once.
export const radius = { control: 12, card: 20, sheet: 24, pill: 999 } as const;

// Color semántico de estado — independiente del color de marca del estudio y
// del modo día/noche (calibrado para pasar 4.5:1 sobre fondos claros y
// oscuros por igual, a diferencia del verde #3E9B6C usado antes en 16 sitios
// distintos, que solo pasaba contraste en modo noche).
export const semantic = {
  success: { text: '#2E7D46', soft: 'rgba(46,125,70,0.12)' },
  warning: { text: '#A65A0A', soft: 'rgba(166,90,10,0.12)' },
  danger: { text: '#C0362D', soft: 'rgba(192,54,45,0.1)' },
} as const;

// Padding inferior de cualquier bottom sheet: nunca un número fijo — tiene
// que ceder ante el home indicator cuando hay uno.
export const sheetBottomPadding = 'max(24px, calc(env(safe-area-inset-bottom) + 16px))';
