// Las fuentes de la integración sin marco, servidas por Tentare (Fase E).
//
// Con una letra elegida en «Cómo se ve», la nativa pinta la misma pareja que la
// app y el iframe. En la app, las familias las pone `next/font`
// (app/_fuentes/fuentes.ts): variables como `--font-jakarta` que apuntan a
// woff2 del propio repo. En la web de un estudio no hay `next/font`, así que el
// bundle mete en su `<head>` UNA hoja (`HOJA_FUENTES_NATIVA`, copia de
// app/widget-bundle/fuentes-nativa.css que hace `build:widget`) y define estas
// mismas variables en el envoltorio del widget, apuntando a las familias de esa
// hoja.
//
// Por qué así y no Google Fonts: cada visitante de la web del estudio mandaría
// su IP a Google sin que la dueña lo sepa, solo por elegir una letra en el
// panel; la app ya dejó Google por eso y por los builds que fallaban. Son los
// mismos bytes que sirve la app, con su licencia OFL al lado.
//
// Por qué `'Tentare …'` y no el nombre de la familia, también en las de
// reserva: la hoja vive en el documento del estudio (un `@font-face` dentro del
// shadow no carga), y si su web ya declara «Figtree» o «Poppins Fallback», las
// dos se pisarían, y la nuestra le cambiaría la letra a su web.
//
// ⚠️ Solo con una letra ELEGIDA (`EstiloNativa.letra`, ./estilo-nativa.ts): con
// «Como tu app» la nativa usa la de su web y no pide nada.
//
// La misma hoja sirve a un código con diseño propio (`data-fuente` /
// `data-fuente-display`) cuando nombra una familia que ya lleva
// (`letraNativa`, abajo). Antes esas dos se pedían a Google desde la web del
// estudio; ahora la nativa no le pide nada a Google nunca.
//
// Solo importa las pilas de reserva y el nombre de familia de siempre (sin
// Next ni React): lo carga el bundle, y lo lee un test que lo compara con
// fuentes.ts, fuentes.css y la hoja (./fuentes-nativa.test.ts).

import { familiaCssDe, fuenteValida, urlFuenteGoogle } from '../reservar/config-widget.ts';
import { RESERVA_SANS, RESERVA_SERIF } from '../reservar/fuentes-catalogo.ts';

/** Versionada: cambiar las fuentes algún día es servirlas en `v2/`, sin pelearse con la caché de un año. */
export const RUTA_FUENTES_NATIVA = '/widget-fuentes/v1';
export const HOJA_FUENTES_NATIVA = `${RUTA_FUENTES_NATIVA}/fuentes.css`;

/** Las carpetas de app/_fuentes que viajan: las 8 familias de las 9 parejas (las copia `build:widget`). */
export const CARPETAS_FUENTES_NATIVA = [
  'plusjakartasans', 'librecaslontext', 'figtree', 'cormorantgaramond', 'outfit', 'poppins', 'instrumentsans', 'instrumentserif',
] as const;

/**
 * Lo que en la app pone `next/font` (app/_fuentes/fuentes.css), aquí hacia las
 * familias de la hoja: base y extendida encadenadas y la reserva ajustada en
 * métrica detrás, como allí. `--font-ui` y `--font-display` no van: los pone la
 * pareja (`varsPareja`, lib/reservar/tema-app.ts), que para «Serena» y «Nítida»
 * los compone con `-latin` y `-ext` (`FUENTE_BASE`).
 *
 * ⚠️ Esa composición es la de la app y nombra la reserva SIN prefijo
 * («'Instrument Sans Fallback'»). Por eso la de Tentare va al final de `-ext`:
 * queda delante de esa y es la que se usa. La otra, detrás, la hoja no la
 * declara: si su web tiene una con ese nombre, no se la tocamos.
 */
export const VARS_FAMILIAS_NATIVA: Readonly<Record<string, string>> = {
  '--font-jakarta': "'Tentare Plus Jakarta Sans', 'Tentare Plus Jakarta Sans Ext', 'Tentare Plus Jakarta Sans Fallback'",
  '--font-libre-caslon': "'Tentare Libre Caslon Text', 'Tentare Libre Caslon Text Ext', 'Tentare Libre Caslon Text Fallback'",
  '--font-figtree': "'Tentare Figtree', 'Tentare Figtree Ext', 'Tentare Figtree Fallback'",
  '--font-cormorant': "'Tentare Cormorant Garamond', 'Tentare Cormorant Garamond Ext', 'Tentare Cormorant Garamond Fallback'",
  '--font-outfit': "'Tentare Outfit', 'Tentare Outfit Ext', 'Tentare Outfit Fallback'",
  '--font-poppins': "'Tentare Poppins', 'Tentare Poppins Ext', 'Tentare Poppins Fallback'",
  '--font-ui-latin': "'Tentare Instrument Sans'",
  '--font-ui-ext': "'Tentare Instrument Sans Ext', 'Tentare Instrument Sans Fallback'",
  '--font-display-latin': "'Tentare Instrument Serif'",
  '--font-display-ext': "'Tentare Instrument Serif Ext', 'Tentare Instrument Serif Fallback'",
};

/**
 * Las familias que la hoja lleva, con el nombre con que las pide un código
 * (`data-fuente="Plus Jakarta Sans"`, el de Google Fonts, que es también el del
 * selector de letras): las variables de `VARS_FAMILIAS_NATIVA` que la escriben,
 * y si lleva remates (la reserva genérica que va detrás).
 *
 * Son las ocho de las parejas de la app. Del selector del diseño propio
 * (lib/reservar/fuentes-catalogo.ts) entran seis: Inter, DM Sans, Playfair
 * Display y Fraunces no están en la app, y sin marco no se ofrecen
 * (components/ui/selector-fuente.tsx).
 */
const FAMILIAS_SERVIDAS: Readonly<Record<string, { variables: readonly string[]; serif: boolean }>> = {
  'Plus Jakarta Sans': { variables: ['--font-jakarta'], serif: false },
  'Figtree': { variables: ['--font-figtree'], serif: false },
  'Outfit': { variables: ['--font-outfit'], serif: false },
  'Poppins': { variables: ['--font-poppins'], serif: false },
  'Instrument Sans': { variables: ['--font-ui-latin', '--font-ui-ext'], serif: false },
  'Libre Caslon Text': { variables: ['--font-libre-caslon'], serif: true },
  'Cormorant Garamond': { variables: ['--font-cormorant'], serif: true },
  'Instrument Serif': { variables: ['--font-display-latin', '--font-display-ext'], serif: true },
};

/** Los nombres que sirve Tentare, tal como van en un código. */
export const FAMILIAS_SERVIDAS_NATIVA: readonly string[] = Object.keys(FAMILIAS_SERVIDAS);

/**
 * El nombre de la familia si Tentare la sirve, o `null`. Como el catálogo, sin
 * distinguir mayúsculas ni espacios de sobra: `data-fuente="poppins"` es Poppins.
 */
export function familiaServida(nombre: string | null | undefined): string | null {
  const buscada = nombre?.trim().toLowerCase();
  if (!buscada) return null;
  return FAMILIAS_SERVIDAS_NATIVA.find(f => f.toLowerCase() === buscada) ?? null;
}

/**
 * El `font-family` de una letra nombrada en el código de la nativa
 * (`data-fuente` o `data-fuente-display`), y si su web tiene que pedir la hoja
 * de Tentare para verla. Lo usan el bundle (`'web'`) y la vista previa del
 * panel (`'panel'`), así que no pueden decir cosas distintas.
 *
 *  - Una que sirve Tentare: sus familias y la reserva de su tipo detrás. En su
 *    web, las «Tentare …» de la hoja (`servida: true`: quien la pinte, mete la
 *    hoja); en el panel, las de `next/font`, que ya están cargadas.
 *  - Cualquier otra (un código de antes con Inter o Playfair, o una escrita a
 *    mano): el nombre tal cual con su reserva, y no se pide NADA a nadie. Se ve
 *    si su web ya la carga (lo normal cuando alguien escribe la letra de su
 *    web), y si no, la reserva.
 *
 * ⚠️ Nunca Google: pedirle una fuente desde la web del estudio le da la IP de
 * cada visitante sin que la dueña lo sepa, por haber elegido una letra.
 */
export function letraNativa(nombre: string, donde: 'web' | 'panel'): { pila: string; servida: boolean } {
  const familia = familiaServida(nombre);
  if (!familia) return { pila: familiaCssDe(nombre), servida: false };
  const { variables, serif } = FAMILIAS_SERVIDAS[familia];
  const nuestras = variables.map(v => (donde === 'web' ? VARS_FAMILIAS_NATIVA[v] : `var(${v})`));
  return { pila: [...nuestras, serif ? RESERVA_SERIF : RESERVA_SANS].join(', '), servida: true };
}

/**
 * La letra del iframe de pago de Stripe (components/checkout-widget/
 * checkout-embebido.tsx), a partir de la PRIMERA familia de `--font-ui`. Ese
 * iframe no ve las `@font-face` de la página: hay que pasarle una hoja que
 * pida él.
 *
 * Una familia «Tentare …» (la nativa con una letra de la hoja) va con la hoja
 * de Tentare que ya está en su web (`hojaTentare`, el `href` del `<link
 * data-tentare-fuentes>`): pedírsela a Google era un 400 y la tarjeta salía sin
 * su letra. Sin esa hoja en la página, `null`, y el pago usa la de siempre.
 * Cualquier otro nombre limpio, como hasta ahora (/reservar y la nativa sin
 * letra servida).
 */
export function fuenteDelPago(primera: string, hojaTentare: string | null): { familia: string; cssSrc: string | null } | null {
  const familia = primera.trim().replace(/^['"]|['"]$/g, '');
  if (!familia) return null;
  if (familia.startsWith('Tentare ')) return hojaTentare ? { familia, cssSrc: hojaTentare } : null;
  return fuenteValida(familia) ? { familia, cssSrc: urlFuenteGoogle(familia) } : null;
}
