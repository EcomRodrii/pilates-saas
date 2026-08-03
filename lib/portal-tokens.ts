// Design tokens del portal de socias — la escala de la que cuelgan todos los
// componentes de components/portal/ui/*. Antes cada pantalla decidía sus
// propios tamaños de fuente, paddings y radios; esto es el único lugar del
// que se eligen ahora. No sustituye lib/portal-modo.tsx (colores de fondo/
// superficie/texto por día-noche) ni el tema publicado del estudio (color de
// marca, vía components/theme-style.tsx) — los complementa con tipografía,
// espaciado, radio y color de estado semántico.
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
//
// ⚠️ `text` en solitario NO pasa 4.5:1 en modo noche pese al comentario de
// arriba (verificado: warning ≈3.3-3.6:1, danger ≈3.0-3.4:1 sobre `bg`/
// `surface` noche) — falso positivo detectado al añadir `AforoIndicator`
// (components/portal/ui/AforoIndicator.tsx), que multiplicó dónde aparece
// este color como texto suelto. `textNoche` es el mismo tono AA-seguro en
// noche, usado por AforoIndicator, el banner de error de HojaReserva Y por
// `Badge.tsx` (que pinta el texto sobre su propio `.soft`, un fondo aún más
// bajo de contraste que `bg`/`surface` plano — verificado: `.text` sobre
// `.soft` compuesto en noche da 2.6-3.3:1, peor que el caso plano;
// `textNoche` sigue pasando 4.5:1 ahí también porque se calibró contra el
// caso más exigente de los dos).
export const semantic = {
  success: { text: '#2E7D46', textNoche: '#3CA25B', soft: 'rgba(46,125,70,0.12)' },
  warning: { text: '#A65A0A', textNoche: '#E0942B', soft: 'rgba(166,90,10,0.12)' },
  danger: { text: '#C0362D', textNoche: '#E86A5F', soft: 'rgba(192,54,45,0.1)' },
} as const;

// Padding inferior de cualquier bottom sheet. Además del home indicator
// (safe-area), tiene que dejar hueco para la TAB BAR FLOTANTE del portal, que
// va anclada abajo (bottom 18px + safe, alto 60 → su borde superior queda a
// ~78px + safe del fondo). Sin esta holgura, el botón de acción de la hoja
// (p. ej. "Reservar") quedaba TAPADO por el menú.
export const sheetBottomPadding = 'max(100px, calc(env(safe-area-inset-bottom) + 92px))';
