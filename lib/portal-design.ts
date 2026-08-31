// El lenguaje visual del portal de la clienta, extraído del diseño
// "Tentare App Cliente v2". Cada valor de aquí sale medido del diseño, no
// redondeado ni "aproximado": si allí pone 33 px de radio, aquí pone 33.
//
// ⚠️ CONVIVE CON `lib/portal-tokens.ts`, que es el lenguaje SALIENTE. Las 14
// pantallas del portal que aún no se han migrado siguen colgando de aquel, y
// tocar sus valores las cambiaría a ciegas — sin diseño contra el que
// comparar. Los dos ficheros conviven a propósito durante la migración; cuando
// la última pantalla pase por aquí, `portal-tokens.ts` se borra.
//
// Lo que NO vive aquí: el color de marca del estudio (`--portal-brand`, lo
// pone el tema publicado) ni los neutros día/noche (`lib/portal-modo.tsx`).
// Esto es forma, tipografía, sombra y movimiento — lo que no cambia de un
// estudio a otro.

import type { CSSProperties } from 'react';

// ── Movimiento ───────────────────────────────────────────────────────────────
//
// Una sola curva para todo. Es la que usa iOS al presentar una hoja: sale
// rápido y frena largo, sin rebote. Mezclarla con `ease` o `linear` es lo que
// hace que una interfaz "parezca una web".
export const EASE = 'cubic-bezier(.16,1,.3,1)';

export const dur = {
  color: 350,      // cambios de color en hover/estado
  control: 450,    // botones y tarjetas al pulsarlas
  card: 500,       // tarjetas que se levantan
  tab: 600,        // la píldora del menú inferior
  sheet: 720,      // la hoja del pase de acceso
  wash: 850,       // el fundido de bienvenida
  washInner: 1400, // el texto de dentro del fundido, más lento a propósito
  // ── Puerta de acceso (handoff «una sola puerta») ─────────────────────────
  // El handoff decía «no crear tokens nuevos, todos los valores ya existen».
  // Estos dos NO existían: 900 no estaba (lo más cerca era `wash`, 850, que es
  // otra cosa) y el foco de un campo no es la píldora del menú aunque los dos
  // midan 600. Se añaden con nombre propio en vez de redondear en silencio a
  // un token que significa otra cosa.
  portada: 900,    // la portada que se retira y el hilo que avanza
  foco: 600,       // la línea de un campo al enfocarlo; el CTA al encenderse
  // El Ken Burns de la foto del hero (Inicio del portal): un bucle continuo,
  // no un fundido de una sola vez, así que ninguno de los de arriba encaja —
  // `washInner` (1400 ms) es lo más largo que había y a esa velocidad un
  // zoom de foto se ve como un parpadeo, no como movimiento sutil. Mismo
  // criterio que `portada`/`foco`: nombre propio en vez de forzar un token
  // que significa otra cosa.
  heroFoto: 20000,
} as const;

/** Transición de un control que se pulsa. `props` en orden de importancia. */
export function transicion(props: string[], ms: number = dur.control): string {
  return props.map((p) => `${p} ${ms}ms ${EASE}`).join(', ');
}

// ── Tipografía ───────────────────────────────────────────────────────────────
//
// ⚠️ CORREGIDO (31-ago) tras verificar contra capturas REALES de Claude
// Design ("Tentare Studio App") y contra el <link> de Google Fonts del
// propio .dc.html exportado: una sola familia, Plus Jakarta Sans, en dos
// pesos — bold para titulares, regular/medium para el resto. NINGUNA
// pantalla de las 20 capturas reales lleva serif ni cursiva.
//
// El "serif dice QUÉ es esto, la sans dice qué HACER" de antes describía
// "Tentare App Cliente v2" — un diseño ANTERIOR y ya sustituido, no el
// vigente. Se mantiene el nombre `serif` (evita tocar cada call-site que lo
// importa) pero ya no es una serif: es Jakarta a peso alto.
// --portal-heading-font la sigue declarando lib/theme-runtime.ts cuando el
// estudio elige un tema de la galería con titular distinto (p.ej.
// "Geométrico" → Outfit); si no, la var no existe y gana Jakarta.
export const serif = "var(--portal-heading-font, var(--font-jakarta)), 'Plus Jakarta Sans', system-ui, sans-serif";
export const sans = "var(--font-jakarta), 'Plus Jakarta Sans', system-ui, sans-serif";

/**
 * Titular. `it` se conserva por compatibilidad con las pantallas que ya lo
 * pasaban (Jakarta no tiene cursiva real cargada — el navegador inclina la
 * redonda; a este peso y en una sans humanista no se nota como se notaría en
 * una Didone, así que no es la Instrument Serif del proyecto anterior).
 */
export function display(size: number | string, it = false, lh = 1): CSSProperties {
  return { fontFamily: serif, fontSize: size, fontStyle: it ? 'italic' : 'normal', lineHeight: lh, fontWeight: 'var(--portal-heading-weight, 700)' };
}

/**
 * Un paso de la escala tipográfica del TEMA, con el número de siempre como
 * fallback. `escalaTexto` es opcional: un estudio sin tema de la tanda
 * Oliva/Bloom/Noir no declara la var y se ve exactamente igual que antes.
 *
 * ⚠️ Existe porque los rótulos estaban escritos a mano y habían derivado a 24
 * en unos bloques y 30 en otros, sin criterio. Con la escala en el tema esa
 * incoherencia no puede volver: es un token, no un número suelto.
 */
export function escala(paso: PasoEscala, siNoHayTema: number): string {
  return `var(--portal-text-${paso}, ${siNoHayTema}px)`;
}

export type PasoEscala =
  | 'seccion' | 'titulo-pantalla' | 'saludo' | 'titulo-hero'
  | 'bienvenida' | 'numero-bono';

// Las micro-etiquetas van en versalitas muy espaciadas. El `paddingLeft` iguala
// al `letterSpacing`: sin él, el espaciado de la ÚLTIMA letra descuadra el
// centrado óptico y el bloque se ve desplazado a la izquierda.
export function micro(size = 9.5, ls = 0.28, weight = 500): CSSProperties {
  return {
    fontFamily: sans, fontSize: size, fontWeight: weight,
    letterSpacing: `${ls}em`, paddingLeft: `${ls}em`, textTransform: 'uppercase',
  };
}

export const texto = {
  meta: { fontFamily: sans, fontSize: 12.5, fontWeight: 400 } as CSSProperties,
  metaFuerte: { fontFamily: sans, fontSize: 12.5, fontWeight: 500 } as CSSProperties,
  valor: { fontFamily: sans, fontSize: 11.5, fontWeight: 400 } as CSSProperties,
  boton: { fontFamily: sans, fontSize: 15.5, fontWeight: 500, letterSpacing: '.01em' } as CSSProperties,
  botonCta: { fontFamily: sans, fontSize: 14.5, fontWeight: 500 } as CSSProperties,
  tab: { fontFamily: sans, fontSize: 11, fontWeight: 500, letterSpacing: '.02em' } as CSSProperties,
  pie: { fontFamily: sans, fontSize: 11.5, fontWeight: 400 } as CSSProperties,
  nota: { fontFamily: sans, fontSize: 11, fontWeight: 400 } as CSSProperties,
} as const;

// ── Forma ────────────────────────────────────────────────────────────────────
//
// Los radios de los botones son exactamente la mitad de su altura (66/2=33,
// 62/2=31): son cápsulas perfectas, no rectángulos redondeados. Redondear a
// 32 los deja con un plano recto de 2 px en el centro del lado, que se ve.
export const radio = {
  hoja: 34,      // hoja de acceso y del pase
  botonAlto: 33, // botón de 66 px
  botonCta: 31,  // botón de 62 px
  heroCard: 30,  // tarjeta grande con foto
  tabbar: 29,
  banner: 26,
  qr: 26,
  card: 24,      // tarjeta interna y tarjetas de la semana
  pastilla: 23,  // la píldora que se desliza por el menú
  pill: 999,
} as const;

export const altura = {
  botonAcceso: 66,
  botonCta: 62,
  fila: 68,      // filas de la lista del inicio
  tabbar: 58,
  topbar: 92,
  heroCard: 476,
  banner: 208,
  fotoAcceso: 486,
} as const;

// ── Sombra ───────────────────────────────────────────────────────────────────
//
// Todas con blur muy grande y spread negativo: la sombra no se ve como sombra,
// se ve como que el elemento pesa. Y todas tiradas del mismo verde oscuro
// (rgba(34,42,30,·)), nunca de negro puro — el negro sobre crema ensucia.
export const sombra = {
  hojaAcceso: '0 -10px 60px -30px rgba(34,38,31,.4)',
  botonOscuro: '0 18px 34px -18px rgba(34,42,30,.6)',
  botonClaro: '0 14px 30px -20px rgba(34,42,30,.45)',
  botonClaroHover: '0 18px 34px -18px rgba(34,42,30,.5)',
  heroCard: '0 34px 70px -40px rgba(34,42,30,.5), 0 2px 6px rgba(34,42,30,.05)',
  cardInterna: '0 18px 40px -26px rgba(34,42,30,.5)',
  cta: '0 16px 30px -18px rgba(34,42,30,.65)',
  cardSemana: '0 12px 30px -22px rgba(34,42,30,.45)',
  cardSemanaHover: '0 22px 40px -24px rgba(34,42,30,.5)',
  banner: '0 24px 50px -34px rgba(34,42,30,.45)',
  tabbar: '0 22px 44px -22px rgba(34,42,30,.32)',
  pastilla: '0 8px 16px -10px rgba(34,42,30,.45)',
  sheet: '0 -24px 70px -30px rgba(34,38,31,.5)',
  circulo: '0 8px 18px -12px rgba(34,42,30,.4)',
  circuloBanner: '0 10px 22px -14px rgba(34,42,30,.5)',
  qr: '0 26px 50px -30px rgba(34,42,30,.45)',
} as const;

// ── Cristal ──────────────────────────────────────────────────────────────────
//
// El `saturate` no es decorativo: sin él, el desenfoque de Safari desatura lo
// que hay detrás y el crema se vuelve gris. Va siempre con su prefijo -webkit-,
// que en iOS sigue siendo el que manda.
export function cristal(blur: number, sat = 160): CSSProperties {
  const f = `blur(${blur}px) saturate(${sat}%)`;
  return { backdropFilter: f, WebkitBackdropFilter: f } as CSSProperties;
}

export const desenfoque = {
  hoja: 42, topbar: 24, chip: 18, cardHero: 34, tabbar: 30, backdrop: 18,
} as const;
