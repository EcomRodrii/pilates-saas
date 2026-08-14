// Tokens del rediseño de Tentare Network — README §Identidad visual del
// handoff (design_handoff_tentare_network/). Colores/radios FINALES, no
// aproximados: cítalos de aquí en vez de repetir hex sueltos por los
// componentes, para que un cambio de paleta sea un solo sitio.
//
// La primera pasada usaba un verde propio (#4F8A5B, el mismo del disco del
// logo — docs/marca/) para TODO el acento de página, no solo el logo. El
// fundador lo devolvió: quería que el marketplace se sintiera la MISMA
// marca que tentare.app, no un producto satélite con su propio verde. Los
// tokens de acento (antes NW_PRODUCTO/NW_VERDE_OSCURO/NW_SAGE, en verde) se
// sustituyen aquí por los tonos reales de la landing principal
// (components/landing/theme.ts: ACC/BG) — el logo SIGUE tiñendo su disco de
// verde (regla 1 del kit de marca, sin tocar: "un producto nunca redibuja
// la marca, solo tiñe su disco"), pero eso es una marca de 24px en la nav,
// no el tono de cada botón y cada fondo de la página.

export const NW_TINTA = '#1A1A1A';
export const NW_FONDO = '#FAF9F5';
export const NW_VERDE_OSCURO = '#0F0F0F';
export const NW_SAGE = '#F1F2EA';
export const NW_SAND = '#F1ECE1';
export const NW_SAND_2 = '#F3EFE4';
export const NW_BORDE = '#E5E3DA';
export const NW_BORDE_HOVER = '#D9D6C9';
export const NW_MUTED = '#5A5A52';
export const NW_MUTED_2 = '#6C7468';
export const NW_GRIS_VERDOSO = '#98A093';
export const NW_ESTRELLA = '#C99A3C';

// Acento de página — el ACC de la landing principal (components/landing/
// theme.ts), no el verde del disco del logo. Mismo nombre de export
// (NW_PRODUCTO) para no tocar los ~40 sitios que ya lo citan; solo cambia
// el valor.
export const NW_PRODUCTO = '#343825';

export const NW_ESTADO = {
  verificada: { color: '#2E5A3A', fondo: '#EAF0E7' },
  pendiente: { color: '#8A6A25', fondo: '#F7EFDD' },
  rechazada: { color: '#A04A3C', fondo: '#F6E7E4' },
} as const;

// Radios: pantalla/paneles 24-26, tarjetas 20-22, láminas/fotos 13-15,
// inputs 12-14, pills 999.
export const NW_RADIO = {
  panel: 26,
  tarjeta: 22,
  foto: 15,
  input: 13,
  pill: 999,
} as const;
