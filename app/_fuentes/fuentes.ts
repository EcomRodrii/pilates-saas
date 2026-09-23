import localFont from 'next/font/local';
import './fuentes.css';

// Las tipografías de toda la app, SERVIDAS DESDE EL REPO. Hasta el 23-sep-2026
// iban por `next/font/google`, que pide el CSS a fonts.googleapis.com en cada
// build — y Google a veces contesta con URLs sin extensión
// (`fonts.gstatic.com/l/font?kit=…&skey=…`) que el cargador de Next no sabe
// leer: el build fallaba al azar, en CI y en Vercel (vercel/next.js#99114). Los
// woff2 son los mismos bytes que servía Google (comprobado contra los que
// precargaba producción) y se bajan con `node scripts/descargar-fuentes.mjs`.
// Todas son OFL: la licencia va al lado de cada familia y viaja con ellas.
//
// ⚠️ Cada familia son DOS llamadas: el subconjunto `latin` (acentos y eñe) y el
// `latin-ext` (Ștefan, Łukasz…). Google las servía como una sola familia con
// `unicode-range`, pero `next/font/local` no admite un `unicode-range` por
// fichero, así que la extendida es una familia aparte que se encadena justo
// detrás de la base en la variable pública (fuentes.css) — el navegador la
// pide solo si la página tiene un carácter de ese rango. Sin ella esos nombres
// saldrían con una letra en Arial en mitad de la palabra.
//
// ⚠️ Un peso por entrada aunque el fichero sea el mismo (las variables): así
// era el CSS de Google, y con un rango (`'400 800'`) un `font-weight: 650`
// pintaría 650 en vez de caer al 700 como hasta ahora. `display` no se
// escribe: `swap` es el valor por defecto de `next/font/local`.
//
// `next/font` exige literales en la llamada — por eso el `unicode-range` se
// repite y no sale de una constante.
//
// ⚠️ El NOMBRE de cada constante es el `font-family` que genera
// `next/font/local` (`Instrument_Sans`, `Instrument_Sans_Ext`). Los guiones
// bajos no son estética: el checkout lee la primera familia de `--font-ui` y,
// si pasa `fuenteValida`, se la pide a Google Fonts para el iframe de Stripe.
// `Instrument_Sans` no pasa (no admite `_`) y cae a su literal 'Instrument
// Sans', como con Google; un `instrumentSans` sí pasaría y Stripe pediría una
// familia que no existe.

const Plus_Jakarta_Sans = localFont({
  src: [
    { path: './plusjakartasans/plusjakartasans-latin.woff2', weight: '400' },
    { path: './plusjakartasans/plusjakartasans-latin.woff2', weight: '500' },
    { path: './plusjakartasans/plusjakartasans-latin.woff2', weight: '600' },
    { path: './plusjakartasans/plusjakartasans-latin.woff2', weight: '700' },
    { path: './plusjakartasans/plusjakartasans-latin.woff2', weight: '800' },
  ],
  adjustFontFallback: false,
  variable: '--font-jakarta-latin',
});
const Plus_Jakarta_Sans_Ext = localFont({
  src: [
    { path: './plusjakartasans/plusjakartasans-latin-ext.woff2', weight: '400' },
    { path: './plusjakartasans/plusjakartasans-latin-ext.woff2', weight: '500' },
    { path: './plusjakartasans/plusjakartasans-latin-ext.woff2', weight: '600' },
    { path: './plusjakartasans/plusjakartasans-latin-ext.woff2', weight: '700' },
    { path: './plusjakartasans/plusjakartasans-latin-ext.woff2', weight: '800' },
  ],
  declarations: [{ prop: 'unicode-range', value: 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF' }],
  adjustFontFallback: false,
  preload: false,
  variable: '--font-jakarta-ext',
});

// Fuente mono del rediseño de /reservar (lib/reservar-publico-tokens.ts) —
// las etiquetas en versalitas (fecha, hora, "plazas libres") y los precios.
const IBM_Plex_Mono = localFont({
  src: [
    { path: './ibmplexmono/ibmplexmono-latin-400.woff2', weight: '400' },
    { path: './ibmplexmono/ibmplexmono-latin-500.woff2', weight: '500' },
  ],
  adjustFontFallback: false,
  variable: '--font-plex-mono-latin',
});
const IBM_Plex_Mono_Ext = localFont({
  src: [
    { path: './ibmplexmono/ibmplexmono-latin-ext-400.woff2', weight: '400' },
    { path: './ibmplexmono/ibmplexmono-latin-ext-500.woff2', weight: '500' },
  ],
  declarations: [{ prop: 'unicode-range', value: 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF' }],
  adjustFontFallback: false,
  preload: false,
  variable: '--font-plex-mono-ext',
});

// Las dos familias del portal de la clienta (lib/portal-design.ts).
//
// La cursiva de la serif NO es decorativa en este diseño —titula la mitad de
// las pantallas—, así que se carga explícitamente: sin ella el navegador la
// falsearía inclinando la redonda, que en una Didone se nota a la legua.
const Instrument_Serif = localFont({
  src: [
    { path: './instrumentserif/instrumentserif-latin-400.woff2', weight: '400', style: 'normal' },
    { path: './instrumentserif/instrumentserif-latin-400-italic.woff2', weight: '400', style: 'italic' },
  ],
  adjustFontFallback: false,
  variable: '--font-display-latin',
});
const Instrument_Serif_Ext = localFont({
  src: [
    { path: './instrumentserif/instrumentserif-latin-ext-400.woff2', weight: '400', style: 'normal' },
    { path: './instrumentserif/instrumentserif-latin-ext-400-italic.woff2', weight: '400', style: 'italic' },
  ],
  declarations: [{ prop: 'unicode-range', value: 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF' }],
  adjustFontFallback: false,
  preload: false,
  variable: '--font-display-ext',
});

// El diseño solo usa 400/500/600, pero se carga también el 700: las 14
// pantallas del portal que aún no se han migrado piden 700 y 800, y sin un
// grueso real el navegador falsea la negrita engordando el trazo — que en una
// grotesca se ve sucio. El 800 cae al 700, que sí existe.
const Instrument_Sans = localFont({
  src: [
    { path: './instrumentsans/instrumentsans-latin.woff2', weight: '400' },
    { path: './instrumentsans/instrumentsans-latin.woff2', weight: '500' },
    { path: './instrumentsans/instrumentsans-latin.woff2', weight: '600' },
    { path: './instrumentsans/instrumentsans-latin.woff2', weight: '700' },
  ],
  adjustFontFallback: false,
  variable: '--font-ui-latin',
});
const Instrument_Sans_Ext = localFont({
  src: [
    { path: './instrumentsans/instrumentsans-latin-ext.woff2', weight: '400' },
    { path: './instrumentsans/instrumentsans-latin-ext.woff2', weight: '500' },
    { path: './instrumentsans/instrumentsans-latin-ext.woff2', weight: '600' },
    { path: './instrumentsans/instrumentsans-latin-ext.woff2', weight: '700' },
  ],
  declarations: [{ prop: 'unicode-range', value: 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF' }],
  adjustFontFallback: false,
  preload: false,
  variable: '--font-ui-ext',
});

// Titular alternativo del tema "Geométrico" (lib/theme-definitions.ts) — solo
// se aplica cuando el estudio elige ese tema, vía --portal-heading-font
// (lib/theme-runtime.ts). Se declara siempre (como las otras) porque next/font
// no admite carga condicional por tenant; el coste es fijo y pequeño.
// Sin precarga: solo la usa un tema concreto (o una sola pieza), y precargada
// se descargaría en TODAS las páginas. Sin precargar, el navegador la pide solo
// cuando algo la pinta. Mismo criterio en todas las de abajo.
const Outfit = localFont({
  src: [
    { path: './outfit/outfit-latin.woff2', weight: '400' },
    { path: './outfit/outfit-latin.woff2', weight: '500' },
    { path: './outfit/outfit-latin.woff2', weight: '600' },
    { path: './outfit/outfit-latin.woff2', weight: '700' },
  ],
  preload: false,
  adjustFontFallback: false,
  variable: '--font-outfit-latin',
});
const Outfit_Ext = localFont({
  src: [
    { path: './outfit/outfit-latin-ext.woff2', weight: '400' },
    { path: './outfit/outfit-latin-ext.woff2', weight: '500' },
    { path: './outfit/outfit-latin-ext.woff2', weight: '600' },
    { path: './outfit/outfit-latin-ext.woff2', weight: '700' },
  ],
  declarations: [{ prop: 'unicode-range', value: 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF' }],
  adjustFontFallback: false,
  preload: false,
  variable: '--font-outfit-ext',
});

// Tema "Bloom" (lib/theme-definitions.ts, FUENTES en lib/theme-schema.ts) —
// `fontId: 'Poppins'` ya estaba en el set curado desde antes, pero sin este
// registro `--font-poppins` no existía y el fallback silencioso a system-ui
// se aplicaba siempre.
const Poppins = localFont({
  src: [
    { path: './poppins/poppins-latin-400.woff2', weight: '400' },
    { path: './poppins/poppins-latin-500.woff2', weight: '500' },
    { path: './poppins/poppins-latin-600.woff2', weight: '600' },
    { path: './poppins/poppins-latin-700.woff2', weight: '700' },
  ],
  preload: false,
  adjustFontFallback: false,
  variable: '--font-poppins-latin',
});
const Poppins_Ext = localFont({
  src: [
    { path: './poppins/poppins-latin-ext-400.woff2', weight: '400' },
    { path: './poppins/poppins-latin-ext-500.woff2', weight: '500' },
    { path: './poppins/poppins-latin-ext-600.woff2', weight: '600' },
    { path: './poppins/poppins-latin-ext-700.woff2', weight: '700' },
  ],
  declarations: [{ prop: 'unicode-range', value: 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF' }],
  adjustFontFallback: false,
  preload: false,
  variable: '--font-poppins-ext',
});

// Tema "Tentada" (themes/tentada/) — la serif de los titulares del portal de
// la alumna. Se cargan 500/600 y la CURSIVA porque el diseño titula con las dos
// («Hola, Laura» en redonda, «hoy toca cuidarte» y la nota del bono en
// cursiva): sin la cursiva real el navegador inclina la redonda, y en una
// Garamond eso se nota tanto como en la Instrument Serif de arriba.
const Cormorant_Garamond = localFont({
  src: [
    { path: './cormorantgaramond/cormorantgaramond-latin.woff2', weight: '400', style: 'normal' },
    { path: './cormorantgaramond/cormorantgaramond-latin.woff2', weight: '500', style: 'normal' },
    { path: './cormorantgaramond/cormorantgaramond-latin.woff2', weight: '600', style: 'normal' },
    { path: './cormorantgaramond/cormorantgaramond-latin-italic.woff2', weight: '400', style: 'italic' },
    { path: './cormorantgaramond/cormorantgaramond-latin-italic.woff2', weight: '500', style: 'italic' },
    { path: './cormorantgaramond/cormorantgaramond-latin-italic.woff2', weight: '600', style: 'italic' },
  ],
  preload: false,
  adjustFontFallback: false,
  variable: '--font-cormorant-latin',
});
const Cormorant_Garamond_Ext = localFont({
  src: [
    { path: './cormorantgaramond/cormorantgaramond-latin-ext.woff2', weight: '400', style: 'normal' },
    { path: './cormorantgaramond/cormorantgaramond-latin-ext.woff2', weight: '500', style: 'normal' },
    { path: './cormorantgaramond/cormorantgaramond-latin-ext.woff2', weight: '600', style: 'normal' },
    { path: './cormorantgaramond/cormorantgaramond-latin-ext-italic.woff2', weight: '400', style: 'italic' },
    { path: './cormorantgaramond/cormorantgaramond-latin-ext-italic.woff2', weight: '500', style: 'italic' },
    { path: './cormorantgaramond/cormorantgaramond-latin-ext-italic.woff2', weight: '600', style: 'italic' },
  ],
  declarations: [{ prop: 'unicode-range', value: 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF' }],
  adjustFontFallback: false,
  preload: false,
  variable: '--font-cormorant-ext',
});

// La MANUSCRITA de la app de la alumna. Una sola cosa la usa —la tarjeta con la
// frase que escribe el estudio, `CitaManuscrita`— y aun así entra aquí: coste
// fijo, igual que `Outfit`, `Poppins` y las dos de Sereno.
//
// Un solo peso porque Sacramento solo tiene uno. Si algún día hace falta
// «negrita» ahí, NO se pone `font-weight: 700`: el navegador la engorda
// sintéticamente y una caligráfica engordada a mano se ve rota.
const Sacramento = localFont({
  src: [{ path: './sacramento/sacramento-latin-400.woff2', weight: '400' }],
  preload: false,
  adjustFontFallback: false,
  variable: '--font-manuscrita-latin',
});
const Sacramento_Ext = localFont({
  src: [{ path: './sacramento/sacramento-latin-ext-400.woff2', weight: '400' }],
  declarations: [{ prop: 'unicode-range', value: 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF' }],
  adjustFontFallback: false,
  preload: false,
  variable: '--font-manuscrita-ext',
});

// Tema "Sereno" (themes/sereno/) — sus DOS familias son solo suyas.
//
// Libre Caslon Text titula: el saludo, el nombre de la clase, los titulares de
// las hojas y el numerazo del bono. Lleva la CURSIVA porque la cita del estudio
// va en cursiva de verdad (mismo motivo que Instrument Serif y Cormorant). El
// 700 entra porque la display se usa a 400 y a 700 en el prototipo (nombre de
// clase vs. rótulos fuertes). Google no tiene 700 cursiva: una cursiva a 700
// sale de la 400 cursiva, como antes.
const Libre_Caslon_Text = localFont({
  src: [
    { path: './librecaslontext/librecaslontext-latin-400.woff2', weight: '400', style: 'normal' },
    { path: './librecaslontext/librecaslontext-latin-700.woff2', weight: '700', style: 'normal' },
    { path: './librecaslontext/librecaslontext-latin-400-italic.woff2', weight: '400', style: 'italic' },
  ],
  preload: false,
  adjustFontFallback: false,
  variable: '--font-libre-caslon-latin',
});
const Libre_Caslon_Text_Ext = localFont({
  src: [
    { path: './librecaslontext/librecaslontext-latin-ext-400.woff2', weight: '400', style: 'normal' },
    { path: './librecaslontext/librecaslontext-latin-ext-700.woff2', weight: '700', style: 'normal' },
    { path: './librecaslontext/librecaslontext-latin-ext-400-italic.woff2', weight: '400', style: 'italic' },
  ],
  declarations: [{ prop: 'unicode-range', value: 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF' }],
  adjustFontFallback: false,
  preload: false,
  variable: '--font-libre-caslon-ext',
});

// El cuerpo de Sereno. 300-700 porque el prototipo usa 500/600 en metadatos y
// rótulos y 700 en los importes.
const Figtree = localFont({
  src: [
    { path: './figtree/figtree-latin.woff2', weight: '300' },
    { path: './figtree/figtree-latin.woff2', weight: '400' },
    { path: './figtree/figtree-latin.woff2', weight: '500' },
    { path: './figtree/figtree-latin.woff2', weight: '600' },
    { path: './figtree/figtree-latin.woff2', weight: '700' },
  ],
  preload: false,
  adjustFontFallback: false,
  variable: '--font-figtree-latin',
});
const Figtree_Ext = localFont({
  src: [
    { path: './figtree/figtree-latin-ext.woff2', weight: '300' },
    { path: './figtree/figtree-latin-ext.woff2', weight: '400' },
    { path: './figtree/figtree-latin-ext.woff2', weight: '500' },
    { path: './figtree/figtree-latin-ext.woff2', weight: '600' },
    { path: './figtree/figtree-latin-ext.woff2', weight: '700' },
  ],
  declarations: [{ prop: 'unicode-range', value: 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF' }],
  adjustFontFallback: false,
  preload: false,
  variable: '--font-figtree-ext',
});

// Las clases que declaran `--font-<x>-latin` y `--font-<x>-ext` en el <html>.
// Las variables públicas (`--font-jakarta`, `--font-ui`…) las compone
// fuentes.css a partir de estas.
export const variablesDeFuente = [
  Plus_Jakarta_Sans.variable,
  Plus_Jakarta_Sans_Ext.variable,
  IBM_Plex_Mono.variable,
  IBM_Plex_Mono_Ext.variable,
  Instrument_Serif.variable,
  Instrument_Serif_Ext.variable,
  Instrument_Sans.variable,
  Instrument_Sans_Ext.variable,
  Outfit.variable,
  Outfit_Ext.variable,
  Poppins.variable,
  Poppins_Ext.variable,
  Cormorant_Garamond.variable,
  Cormorant_Garamond_Ext.variable,
  Sacramento.variable,
  Sacramento_Ext.variable,
  Libre_Caslon_Text.variable,
  Libre_Caslon_Text_Ext.variable,
  Figtree.variable,
  Figtree_Ext.variable,
].join(' ');
