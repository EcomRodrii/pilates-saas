// Tokens del rediseño de Tentare Network — README §Identidad visual del
// handoff (design_handoff_tentare_network/). Colores/radios FINALES, no
// aproximados: cítalos de aquí en vez de repetir hex sueltos por los
// componentes, para que un cambio de paleta sea un solo sitio.
//
// Distinto de components/landing/network/data.ts (el verde #4F8A5B genérico
// de marca, usado en /network/unirse): esta paleta es la del rediseño
// completo del marketplace, más rica — verde oscuro de panel, sage, sand,
// estados de verificación con su propio par color/fondo.

export const NW_TINTA = '#222A33';
export const NW_FONDO = '#FAF9F5';
export const NW_VERDE_OSCURO = '#26402C';
export const NW_SAGE = '#EAF0E7';
export const NW_SAND = '#F1ECE1';
export const NW_SAND_2 = '#F3EFE4';
export const NW_BORDE = '#E5E3DA';
export const NW_BORDE_HOVER = '#D9D6C9';
export const NW_MUTED = '#5F6960';
export const NW_MUTED_2 = '#6C7468';
export const NW_GRIS_VERDOSO = '#98A093';
export const NW_ESTRELLA = '#C99A3C';

// Producto Network del kit de marca (docs/marca/) — el disco del isotipo.
export const NW_PRODUCTO = '#4F8A5B';

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
