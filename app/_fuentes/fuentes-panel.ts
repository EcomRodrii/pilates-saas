import localFont from 'next/font/local';

// Las dos familias del Brand System (brand/brand-os.md §6): Schibsted Grotesk
// para todo y DM Mono para horas, cifras y etiquetas. Fase 2: SOLO en el panel
// (`.marca-panel`, app/(dashboard)/layout.tsx). La app de la alumna, la
// landing y /ayuda siguen con Jakarta hasta su fase.
//
// Por qué un módulo aparte de fuentes.ts: lo importa solo el layout del panel,
// así que la landing y la app de la alumna no precargan dos fuentes que no usan.
//
// ⚠️ El `font-family` va en `declarations` con el NOMBRE REAL de la familia,
// no el de la constante: `brand/tokens.css` dice `--t-font-sans: 'Schibsted
// Grotesk', …` y `--t-font-mono: 'DM Mono', …`, y así esos tokens resuelven tal
// cual, sin copiarlos aquí. Las dos llamadas de cada familia (latin y
// latin-ext) comparten nombre y se reparten el `unicode-range`, que es como lo
// sirve Google: una familia, y el navegador pide la extendida solo si la página
// tiene un carácter suyo.
//
// Solo los pesos aprobados (400/500/600 y 400/500). Lo que pida más peso
// (`font-bold`, `font-extrabold`) cae al 600 sin negrita sintética: lo fija
// `font-synthesis-weight: none` en `.marca-panel` (globals.css).

const Schibsted_Grotesk = localFont({
  src: [
    { path: './schibstedgrotesk/schibstedgrotesk-latin.woff2', weight: '400' },
    { path: './schibstedgrotesk/schibstedgrotesk-latin.woff2', weight: '500' },
    { path: './schibstedgrotesk/schibstedgrotesk-latin.woff2', weight: '600' },
  ],
  declarations: [
    { prop: 'font-family', value: "'Schibsted Grotesk'" },
    { prop: 'unicode-range', value: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD' },
  ],
  adjustFontFallback: false,
  variable: '--font-schibsted-latin',
});
const Schibsted_Grotesk_Ext = localFont({
  src: [
    { path: './schibstedgrotesk/schibstedgrotesk-latin-ext.woff2', weight: '400' },
    { path: './schibstedgrotesk/schibstedgrotesk-latin-ext.woff2', weight: '500' },
    { path: './schibstedgrotesk/schibstedgrotesk-latin-ext.woff2', weight: '600' },
  ],
  declarations: [
    { prop: 'font-family', value: "'Schibsted Grotesk'" },
    { prop: 'unicode-range', value: 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF' },
  ],
  adjustFontFallback: false,
  preload: false,
  variable: '--font-schibsted-ext',
});

const DM_Mono = localFont({
  src: [
    { path: './dmmono/dmmono-latin-400.woff2', weight: '400' },
    { path: './dmmono/dmmono-latin-500.woff2', weight: '500' },
  ],
  declarations: [
    { prop: 'font-family', value: "'DM Mono'" },
    { prop: 'unicode-range', value: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD' },
  ],
  adjustFontFallback: false,
  variable: '--font-dm-mono-latin',
});
const DM_Mono_Ext = localFont({
  src: [
    { path: './dmmono/dmmono-latin-ext-400.woff2', weight: '400' },
    { path: './dmmono/dmmono-latin-ext-500.woff2', weight: '500' },
  ],
  declarations: [
    { prop: 'font-family', value: "'DM Mono'" },
    { prop: 'unicode-range', value: 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF' },
  ],
  adjustFontFallback: false,
  preload: false,
  variable: '--font-dm-mono-ext',
});

/** Las clases que meten los `@font-face` de la marca en la página del panel. */
export const variablesTipografiaPanel = [
  Schibsted_Grotesk.variable,
  Schibsted_Grotesk_Ext.variable,
  DM_Mono.variable,
  DM_Mono_Ext.variable,
].join(' ');
