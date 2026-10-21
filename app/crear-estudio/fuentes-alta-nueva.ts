import localFont from 'next/font/local';

// Las letras de la marca para el alta nueva (maqueta aprobada el 21-oct-2026):
// Schibsted Grotesk para todo y DM Mono para etiquetas y la dirección de su
// página. Los mismos ficheros y el mismo NOMBRE de familia que el panel
// (app/_fuentes/fuentes-panel.ts), así que `.marca-panel` las encuentra igual.
//
// Por qué no se importa fuentes-panel.ts: aquel PRECARGA sus fuentes, y
// /crear-estudio sigue sirviendo el alta de siempre a casi todo el mundo
// mientras ALTA_NUEVA_REGISTRO esté en «prueba». Sin precargarlas, el
// navegador solo las pide si algo de la página las usa, o sea, solo en el alta
// nueva. Solo latin: es todo lo que escribe el alta (ñ y tildes incluidas), y
// el panel ya trae la extendida para lo demás.
const Schibsted_Grotesk = localFont({
  src: [
    { path: '../_fuentes/schibstedgrotesk/schibstedgrotesk-latin.woff2', weight: '400' },
    { path: '../_fuentes/schibstedgrotesk/schibstedgrotesk-latin.woff2', weight: '500' },
    { path: '../_fuentes/schibstedgrotesk/schibstedgrotesk-latin.woff2', weight: '600' },
  ],
  declarations: [{ prop: 'font-family', value: "'Schibsted Grotesk'" }],
  adjustFontFallback: false,
  preload: false,
  variable: '--font-schibsted-alta',
});

const DM_Mono = localFont({
  src: [
    { path: '../_fuentes/dmmono/dmmono-latin-400.woff2', weight: '400' },
    { path: '../_fuentes/dmmono/dmmono-latin-500.woff2', weight: '500' },
  ],
  declarations: [{ prop: 'font-family', value: "'DM Mono'" }],
  adjustFontFallback: false,
  preload: false,
  variable: '--font-dm-mono-alta',
});

/** Las clases que meten los `@font-face` de la marca en el alta nueva. */
export const variablesTipografiaAltaNueva = [Schibsted_Grotesk.variable, DM_Mono.variable].join(' ');
