// Tokens del rediseño de Tentare Network — README §Identidad visual del
// handoff (design_handoff_tentare_network/). Colores/radios FINALES, no
// aproximados: cítalos de aquí en vez de repetir hex sueltos por los
// componentes, para que un cambio de paleta sea un solo sitio.
//
// Historial del acento (dos vueltas, no una): la primera pasada usaba un
// verde propio (#4F8A5B, el del disco del logo) para todo el acento de
// página; el fundador lo devolvió por sentir que Network se separaba de la
// marca de tentare.app, y NW_PRODUCTO pasó a var(--brand) (oliva). El
// mockup de Claude Design de la landing principal (2026-08-30,
// "UI mockups for landing page") usa ESE MISMO verde (#4F8A5B/#3E6B4A
// hover/#6FA97C claro) como acento de TODA la marca, no solo de Network —
// confirmado explícitamente por el fundador al revisar la divergencia entre
// /network y el mockup. Revierte la decisión anterior a propósito: ya no es
// "el verde satélite de Network", es el acento de marca actualizado.

// NW_TINTA sigue citando --foreground por variable (mismo motivo de
// siempre: un rebranding de Studio se propaga aquí solo). NW_PRODUCTO YA NO
// coincide con --brand (ver historial arriba) — es hex fijo del mockup,
// igual que el resto de esta paleta HERMANA (fondo, sage, muted, bordes...),
// que nunca coincidió con ningún custom property de Studio.
//
// Seguro porque `.dark` solo se añade al contenedor del panel
// (lib/panel-theme.tsx, nunca a <html>, ver app/globals.css) — /network
// vive fuera de (dashboard), así que NW_TINTA (var()) SIEMPRE resuelve al
// valor de :root (claro), nunca al de .dark.
export const NW_TINTA = 'var(--foreground)';
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

// Acento de página — el verde del mockup (ver historial arriba), no
// var(--brand). Hex fijo a propósito: es el mismo verde del disco del logo
// (docs/marca/), así que fusionarlo con --brand no aportaría nada nuevo.
export const NW_PRODUCTO = '#4F8A5B';
// Variante oscura para hover/focus sobre NW_PRODUCTO (botones, enlaces
// sobre fondo claro) — del mismo mockup.
export const NW_PRODUCTO_OSCURO = '#3E6B4A';
// Variante clara para hover de enlaces sobre fondo oscuro (NW_VERDE_OSCURO)
// — del mismo mockup.
export const NW_PRODUCTO_CLARO = '#6FA97C';

// Segundo acento de marca — la arena del kit oliva/arena (docs/marca/), no
// un tono nuevo. Se cita por variable (`--brand-foreground`, "texto sobre
// oliva" en app/globals.css) porque, a diferencia de NW_PRODUCTO, el mockup
// no define un segundo acento cálido propio — Network sigue tomando este de
// donde ya lo toma el resto de la app. Rediseño 2026-08-26: la página solo
// usaba oliva/negro/crema — un único tono de acento para TODO (eyebrows,
// links, puntos, iconos) es justo lo que hacía sentir la marca plana. La
// arena entra como acento CÁLIDO secundario (badges, cifras destacadas,
// detalles sobre fondos oscuros) — NW_PRODUCTO sigue siendo el acento
// principal de acción (CTAs, enlaces).
export const NW_ARENA = 'var(--brand-foreground)';

// Tarjeta "sin Network" de la sección Problema (/network) — el único sitio
// que usa este tono neutro apagado, distinto de NW_MUTED (que sí se repite
// en toda la página). Centralizado aquí tras la auditoría del sistema de
// diseño (2026-08-18): vivía como hex suelto en app/network/page.tsx.
export const NW_PROBLEMA = {
  fondo: '#F4F2EC',
  texto: '#6B6B62',
  icono: '#B0AFA4',
} as const;

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
