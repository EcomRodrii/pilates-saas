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

// Fase 2 del sistema de diseño (2026-08-18): NW_TINTA/NW_PRODUCTO (abajo) son
// los dos únicos tokens de esta paleta que hoy coinciden EXACTAMENTE con un
// custom property de Studio (--foreground/--brand) — se citan por variable
// en vez de repetir el hex, así que un rebranding de Studio se propaga aquí
// solo. El resto de esta paleta (fondo, sage, muted, bordes...) es una
// paleta HERMANA, no un calco de Studio — sus valores no coinciden con
// ningún custom property existente, así que se quedan en hex fijo aquí
// (fusionarlos de verdad cambiaría el aspecto del marketplace sin que se
// haya pedido; decisión explícita, no un olvido).
//
// Seguro porque `.dark` solo se añade al contenedor del panel
// (lib/panel-theme.tsx, nunca a <html>, ver app/globals.css) — /network
// vive fuera de (dashboard), así que estas var() SIEMPRE resuelven al valor
// de :root (claro), nunca al de .dark. Cero cambio visual hoy.
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

// Acento de página — el ACC de la landing principal (components/landing/
// theme.ts), no el verde del disco del logo. Mismo nombre de export
// (NW_PRODUCTO) para no tocar los ~40 sitios que ya lo citan; solo cambia
// el valor. Fusionado con --brand (ver la nota de NW_TINTA arriba): mismo
// hex hoy, ahora también el mismo origen.
export const NW_PRODUCTO = 'var(--brand)';

// Segundo acento de marca — la arena del kit oliva/arena (docs/marca/), no
// un tono nuevo. Mismo criterio de cita-por-variable que NW_PRODUCTO/NW_TINTA
// de arriba: `--brand-foreground` es el "texto sobre oliva" ya definido en
// app/globals.css (el mismo D9C29E que btnCta usa en la landing principal),
// así que Network toma su segundo acento del mismo sitio que ya usa el resto
// de la app en vez de inventar un hex propio. Rediseño 2026-08-26: la página
// solo usaba oliva/negro/crema — un único tono de acento para TODO (eyebrows,
// links, puntos, iconos) es justo lo que hacía sentir la marca plana. La
// arena entra como acento CÁLIDO secundario (badges, cifras destacadas,
// detalles sobre fondos oscuros) — el oliva (NW_PRODUCTO) sigue siendo el
// acento principal de acción (CTAs, enlaces).
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
