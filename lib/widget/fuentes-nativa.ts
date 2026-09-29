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
// Y sus woff2 son también los que se le dan al iframe de pago de Stripe, en
// cualquier página (`fuenteDelPago`): /reservar, la app de la alumna o la
// nativa. Ese iframe no ve las fuentes de la página, y antes se las pedía a
// Google.
//
// Solo importa las pilas de reserva y el nombre de familia de siempre (sin
// Next ni React): lo carga el bundle, y lo lee un test que lo compara con
// fuentes.ts, fuentes.css y la hoja (./fuentes-nativa.test.ts).

import { familiaCssDe, fuenteValida } from '../reservar/config-widget.ts';
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
 * `carpeta`, `pesos` y `porPeso` son sus caras sin cursiva, para el pago
 * (`carasDelPago`): un woff2 variable para todos los pesos
 * (`figtree-latin.woff2`) o uno por peso (`poppins-latin-400.woff2`), con los
 * mismos pesos en la extendida. Un test las ata regla a regla a la hoja.
 *
 * Son las ocho de las parejas de la app. Del selector del diseño propio
 * (lib/reservar/fuentes-catalogo.ts) entran seis: Inter, DM Sans, Playfair
 * Display y Fraunces no están en la app, y no se ofrecen
 * (components/ui/selector-fuente.tsx).
 */
const FAMILIAS_SERVIDAS: Readonly<Record<string, {
  variables: readonly string[]; serif: boolean; carpeta: string; pesos: readonly number[]; porPeso: boolean;
}>> = {
  'Plus Jakarta Sans': { variables: ['--font-jakarta'], serif: false, carpeta: 'plusjakartasans', pesos: [400, 500, 600, 700, 800], porPeso: false },
  'Figtree': { variables: ['--font-figtree'], serif: false, carpeta: 'figtree', pesos: [300, 400, 500, 600, 700], porPeso: false },
  'Outfit': { variables: ['--font-outfit'], serif: false, carpeta: 'outfit', pesos: [400, 500, 600, 700], porPeso: false },
  'Poppins': { variables: ['--font-poppins'], serif: false, carpeta: 'poppins', pesos: [400, 500, 600, 700], porPeso: true },
  'Instrument Sans': { variables: ['--font-ui-latin', '--font-ui-ext'], serif: false, carpeta: 'instrumentsans', pesos: [400, 500, 600, 700], porPeso: false },
  'Libre Caslon Text': { variables: ['--font-libre-caslon'], serif: true, carpeta: 'librecaslontext', pesos: [400, 700], porPeso: true },
  'Cormorant Garamond': { variables: ['--font-cormorant'], serif: true, carpeta: 'cormorantgaramond', pesos: [400, 500, 600], porPeso: false },
  'Instrument Serif': { variables: ['--font-display-latin', '--font-display-ext'], serif: true, carpeta: 'instrumentserif', pesos: [400], porPeso: true },
};

/** El `unicode-range` de la extendida (latin-ext), el mismo en todas las familias de la hoja. */
export const RANGO_EXTENDIDA = 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF';

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
 * El `font-family` de una letra nombrada en un código (`data-fuente` /
 * `data-fuente-display` sin marco, `?fuente=` / `?fuente-display=` en la
 * página de reservas incrustada), y si su web tiene que pedir la hoja de
 * Tentare para verla. Lo usan el bundle (`'web'`) y la app (`'app'`: la vista
 * previa del panel, el selector de letras y /reservar), así que no pueden
 * decir cosas distintas.
 *
 *  - Una que sirve Tentare: sus familias y la reserva de su tipo detrás. En su
 *    web, las «Tentare …» de la hoja (`servida: true`: quien la pinte, mete la
 *    hoja); en la app, las de `next/font`, que ya están declaradas y se
 *    descargan del propio Tentare al pintarse.
 *  - Cualquier otra (un código de antes con Inter o Playfair, o una escrita a
 *    mano): el nombre tal cual con su reserva, y no se pide NADA a nadie. Sin
 *    marco se ve si su web ya la carga (lo normal cuando alguien escribe la
 *    letra de su web); en la página de reservas, que es otro documento, solo
 *    si quien mira la tiene instalada. Si no, la reserva.
 *
 * ⚠️ Nunca Google: pedirle una fuente le da la IP de cada visitante sin que la
 * dueña lo sepa, por haber elegido una letra — desde su web o desde el iframe.
 */
export function letraNativa(nombre: string, donde: 'web' | 'app'): { pila: string; servida: boolean } {
  const familia = familiaServida(nombre);
  if (!familia) return { pila: familiaCssDe(nombre), servida: false };
  const { variables, serif } = FAMILIAS_SERVIDAS[familia];
  const nuestras = variables.map(v => (donde === 'web' ? VARS_FAMILIAS_NATIVA[v] : `var(${v})`));
  return { pila: [...nuestras, serif ? RESERVA_SERIF : RESERVA_SANS].join(', '), servida: true };
}

/**
 * Una cara de la hoja tal como la quiere Stripe (`CustomFontSource` de
 * @stripe/stripe-js; aquí sin importarlo: este módulo lo compila el bundle).
 */
export interface CaraDelPago {
  family: string;
  src: string;
  weight: string;
  style: 'normal';
  display: 'swap';
  unicodeRange?: string;
}

/**
 * Las caras sin cursiva de una familia servida, con su URL ABSOLUTA en
 * `origen` (el de Tentare), para el iframe de pago. La extendida va con el
 * mismo nombre de familia y su `unicode-range`, como las daba Google: así el
 * pago nombra una sola familia.
 *
 * ⚠️ Por qué no la hoja como `cssSrc`, que era lo natural: medido en el
 * navegador (29-sep-2026), el iframe de Stripe no carga NINGUNA de sus letras
 * —sus `url()` son relativas a la hoja, y las de Google son absolutas—, y la
 * misma woff2 con su URL absoluta sí. Y solo por https: en `http://localhost`
 * no carga ni así, así que en desarrollo el pago sale en la del sistema.
 */
export function carasDelPago(familia: string, origen: string): CaraDelPago[] {
  const datos = FAMILIAS_SERVIDAS[familia];
  if (!datos) return [];
  const { carpeta, pesos, porPeso } = datos;
  return (['latin', 'latin-ext'] as const).flatMap(subconjunto => pesos.map(peso => {
    const fichero = porPeso ? `${carpeta}-${subconjunto}-${peso}.woff2` : `${carpeta}-${subconjunto}.woff2`;
    const cara: CaraDelPago = {
      family: `Tentare ${familia}`,
      src: `url(${new URL(`${RUTA_FUENTES_NATIVA}/${carpeta}/${fichero}`, origen).href})`,
      weight: String(peso),
      style: 'normal',
      display: 'swap',
    };
    return subconjunto === 'latin-ext' ? { ...cara, unicodeRange: RANGO_EXTENDIDA } : cara;
  }));
}

/** La letra del pago cuando la página no dice ninguna: la de siempre del widget, ahora de Tentare. */
export const FAMILIA_PAGO_POR_DEFECTO = 'Instrument Sans';

/**
 * La letra del iframe de pago de Stripe (components/checkout-widget/
 * checkout-embebido.tsx), a partir de la PRIMERA familia de `--font-ui` (o
 * del nombre que pase quien lo monta). Ese iframe no ve las `@font-face` de la
 * página: hay que darle sus caras (`carasDelPago`), y son siempre las de
 * Tentare (en `origen`), nunca Google: sería mandarle a un tercero la IP de
 * quien paga por enseñarle una letra.
 *
 *  - Una familia que sirve Tentare, se llame como en la hoja («Tentare
 *    Poppins», la nativa con una letra elegida), como en el catálogo
 *    («Poppins») o como la nombra `next/font/local` en la app
 *    («Plus_Jakarta_Sans», «Instrument_Sans»: el nombre de la constante, con
 *    guiones bajos, app/_fuentes/fuentes.ts): su «Tentare …» con sus caras.
 *  - Cualquier otro nombre limpio (la letra de su web, un código de antes con
 *    Inter): se nombra y no se pide. Dentro del iframe solo se ve si quien
 *    paga la tiene instalada; si no, la del sistema.
 *  - Nada que sirva (vacío, un alias raro): la de siempre del widget,
 *    Instrument Sans, de Tentare.
 */
export function fuenteDelPago(primera: string | null | undefined, origen: string): { familia: string; fuentes: CaraDelPago[] } {
  const familia = (primera ?? '').trim().replace(/^['"]|['"]$/g, '');
  const servida = familiaServida(familia.replace(/^Tentare /, '').replace(/_/g, ' '));
  if (servida) return { familia: `Tentare ${servida}`, fuentes: carasDelPago(servida, origen) };
  if (familia && fuenteValida(familia)) return { familia, fuentes: [] };
  return { familia: `Tentare ${FAMILIA_PAGO_POR_DEFECTO}`, fuentes: carasDelPago(FAMILIA_PAGO_POR_DEFECTO, origen) };
}
