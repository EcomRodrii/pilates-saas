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
// Sin imports a propósito: lo carga el bundle, y lo lee un test que lo compara
// con fuentes.ts, fuentes.css y la hoja (./fuentes-nativa.test.ts).

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
