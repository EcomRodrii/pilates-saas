// Los colores de Tenti, leídos de los tokens de app/globals.css.
//
// El prototipo traía su paleta escrita en el motor: chispas blancas (invisibles
// sobre --card), mofletes rosa chicle, un verde menta para 'hecho' y un aro
// negro en la insignia. Nada de eso es de Tentare. Aquí se lee lo que el panel
// ya decide para claro y oscuro, así que Tenti cambia de modo con el resto de
// la pantalla en vez de llevar su propio tema.
//
// ⚠️ Solo los tokens que usa la fase 1 (reposo y 'hecho'). Leer más —
// --destructive, --warning…— solo añadiría formas de caer a 'defecto' en
// silencio, para colores de estados que el panel no enseña.
//
// ⚠️ --success se lee DIRECTO y no con un alias tipo `--tenti-hecho:
// var(--success)` en :root: la var() se resuelve donde se declara, así que
// dentro de .dark el alias seguiría valiendo el verde CLARO.
//
// Puro (sin DOM) para poder probarlo con node --test: quien lo llama le pasa
// cómo leer un token (getComputedStyle(canvas).getPropertyValue en el navegador).

import { ratioContraste } from '../wcag-contrast.ts';

export interface PaletaTenti {
  /** Degradado del cuerpo y de las manos: [luz, sombra]. */
  cuerpo: [luz: string, sombra: string];
  /** Ojos. */
  tinta: string;
  /** Mofletes. */
  rubor: string;
  /** Chispas de la celebración: tienen que verse sobre --background y --card. */
  chispa: string;
  /** El tinte de 'hecho'. */
  hecho: string;
}

export const TOKENS_TENTI = {
  cuerpoLuz: '--tenti-cuerpo-luz',
  cuerpoSombra: '--tenti-cuerpo-sombra',
  tinta: '--tenti-tinta',
  rubor: '--tenti-rubor',
  chispa: '--tenti-chispa',
  hecho: '--success',
} as const;

// Sin distinguir mayúsculas: el --destructive oscuro es '#E08a6B', y el día que
// un token de Tenti se escriba así no puede tirar la paleta entera a 'defecto'.
const HEX = /^#[0-9a-f]{6}$/i;

/** La paleta, o `null` si falta algún token o alguno no es un #RRGGBB. */
export function paletaDesdeTokens(leer: (token: string) => string | null | undefined): PaletaTenti | null {
  const v = (token: string): string | null => {
    const s = (leer(token) ?? '').trim();
    return HEX.test(s) ? s : null;
  };
  const luz = v(TOKENS_TENTI.cuerpoLuz), sombra = v(TOKENS_TENTI.cuerpoSombra), tinta = v(TOKENS_TENTI.tinta);
  const rubor = v(TOKENS_TENTI.rubor), chispa = v(TOKENS_TENTI.chispa), hecho = v(TOKENS_TENTI.hecho);
  if (!luz || !sombra || !tinta || !rubor || !chispa || !hecho) return null;
  return { cuerpo: [luz, sombra], tinta, rubor, chispa, hecho };
}

/** Los colores del traje de temporada (el gorro de bruja): `a` el cono y el
 *  ala, `b` la banda. */
export interface ColoresTraje { a: string; b: string }

export const TOKENS_TRAJE = { a: '--tenti-traje-a', b: '--tenti-traje-b' } as const;

/**
 * Los colores del traje, o `null` si falta alguno (el motor usa entonces los de
 * `TRAJES`, lib/tenti/trajes.ts). Aparte de `paletaDesdeTokens` a propósito: un
 * token del gorro que falte no puede tirar el CUERPO a 'defecto'.
 */
export function coloresDeTrajeDesdeTokens(leer: (token: string) => string | null | undefined): ColoresTraje | null {
  const v = (token: string): string | null => {
    const s = (leer(token) ?? '').trim();
    return HEX.test(s) ? s : null;
  };
  const a = v(TOKENS_TRAJE.a), b = v(TOKENS_TRAJE.b);
  return a && b ? { a, b } : null;
}

/** '#rrggbb' de un color CSS calculado ('rgb(…)', 'rgba(…)', 'color(srgb …)' o
 *  hex), o null si no se sabe leer o es transparente. */
export function hexDeColorCss(css: string | null | undefined): string | null {
  const s = (css ?? '').trim().toLowerCase();
  if (HEX.test(s)) return s;
  let canales: number[] | null = null, alfa = 1;
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(s);
  if (rgb) {
    canales = [rgb[1], rgb[2], rgb[3]].map(Number);
    if (rgb[4] != null) alfa = rgb[4].endsWith('%') ? parseFloat(rgb[4]) / 100 : Number(rgb[4]);
  } else {
    const srgb = /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/.exec(s);
    if (srgb) {
      canales = [srgb[1], srgb[2], srgb[3]].map((v) => Number(v) * 255);
      if (srgb[4] != null) alfa = srgb[4].endsWith('%') ? parseFloat(srgb[4]) / 100 : Number(srgb[4]);
    }
  }
  if (!canales || canales.some((c) => !Number.isFinite(c)) || alfa < 1) return null;
  return `#${canales.map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * El borde del gorro cuando Tenti no lleva silueta (el canvas grande): solo si
 * el cono no se despega de la superficie (< 3:1, WCAG 1.4.11), y entonces con
 * el color del texto de esa superficie. Pasa sobre bg-primary en claro (1,5:1);
 * sobre --card y --background, en los dos modos, el gorro ya se ve solo y un
 * borde claro en oscuro se leía como una pegatina. Si la superficie no se sabe
 * leer, con borde: mejor un borde de más que un gorro invisible.
 */
export function siluetaDelTraje(cono: string, fondoCss: string | null, textoCss: string): string | null {
  const fondo = hexDeColorCss(fondoCss);
  if (fondo && (ratioContraste(cono, fondo) ?? 0) >= 3) return null;
  return textoCss.trim() || null;
}
