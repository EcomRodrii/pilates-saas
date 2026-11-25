import localFont from 'next/font/local';

// Inter (SIL OFL, `./inter/OFL.txt`), variable 100–900 para llegar a los pesos 330 y 450. La usan el
// marco a sangre del panel (`SHELL_NUEVO`, que copia el admin de Shopify, donde la letra es Inter) y
// /precios. Aparte de fuentes-panel.ts porque aquel PRECARGA la tipografía de la marca, y la web
// pública no la usa. `preload: false`: el archivo solo se pide si algo de la página usa 'Inter'.
const Inter_Shell = localFont({
  src: [{ path: './inter/inter-latin-wght-normal.woff2', weight: '100 900' }],
  declarations: [
    { prop: 'font-family', value: "'Inter'" },
    { prop: 'unicode-range', value: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD' },
  ],
  adjustFontFallback: false,
  preload: false,
  variable: '--font-inter-shell',
});
const Inter_Shell_Ext = localFont({
  src: [{ path: './inter/inter-latin-ext-wght-normal.woff2', weight: '100 900' }],
  declarations: [
    { prop: 'font-family', value: "'Inter'" },
    { prop: 'unicode-range', value: 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF' },
  ],
  adjustFontFallback: false,
  preload: false,
  variable: '--font-inter-shell-ext',
});

/** Las clases que meten los `@font-face` de Inter en la página. */
export const variablesInter = [Inter_Shell.variable, Inter_Shell_Ext.variable].join(' ');
