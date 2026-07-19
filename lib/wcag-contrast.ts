// ═══════════════════════════════════════════════════════════════════════════
// Contraste WCAG 2.1 — utilidad compartida (cliente y servidor)
// ═══════════════════════════════════════════════════════════════════════════
//
// Base del white-label (Fase 0). El editor de tema usa esto para dar feedback
// en vivo del contraste al elegir colores, y el servidor lo re-verifica como
// gate al PUBLICAR un tema (no confiar en el cliente). Cero dependencias para
// poder importarse en cualquier runtime (RSC, route handler, navegador).
//
// Referencia: https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio

/** Canales sRGB 0–255. */
export type Rgb = { r: number; g: number; b: number };

/** Nivel WCAG a comprobar. */
export type NivelWCAG = 'AA' | 'AAA';

/** Umbrales de ratio de contraste por nivel y tamaño de texto. */
export const UMBRAL_CONTRASTE = {
  AA: { normal: 4.5, grande: 3 },
  AAA: { normal: 7, grande: 4.5 },
} as const;

/**
 * Parsea un color hex (#RGB, #RRGGBB o #RRGGBBAA — el alfa se ignora para
 * luminancia) a canales sRGB. Devuelve null si el formato no es válido.
 */
export function hexARgb(hex: string): Rgb | null {
  const limpio = hex.trim().replace(/^#/, '');
  const expandido =
    limpio.length === 3 || limpio.length === 4
      ? limpio
          .slice(0, 3)
          .split('')
          .map((c) => c + c)
          .join('')
      : limpio.length === 6 || limpio.length === 8
        ? limpio.slice(0, 6)
        : null;
  if (expandido === null || !/^[0-9a-fA-F]{6}$/.test(expandido)) return null;
  return {
    r: parseInt(expandido.slice(0, 2), 16),
    g: parseInt(expandido.slice(2, 4), 16),
    b: parseInt(expandido.slice(4, 6), 16),
  };
}

/** Luminancia relativa de un canal linealizado (WCAG). */
function linealizar(canal: number): number {
  const c = canal / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Luminancia relativa (0 = negro, 1 = blanco) de un color sRGB. */
export function luminanciaRelativa({ r, g, b }: Rgb): number {
  return 0.2126 * linealizar(r) + 0.7152 * linealizar(g) + 0.0722 * linealizar(b);
}

/**
 * Ratio de contraste entre dos colores hex (1–21). Devuelve null si alguno
 * no es un hex válido.
 */
export function ratioContraste(hexA: string, hexB: string): number | null {
  const a = hexARgb(hexA);
  const b = hexARgb(hexB);
  if (!a || !b) return null;
  const la = luminanciaRelativa(a);
  const lb = luminanciaRelativa(b);
  const claro = Math.max(la, lb);
  const oscuro = Math.min(la, lb);
  return (claro + 0.05) / (oscuro + 0.05);
}

/**
 * ¿El par de colores cumple el nivel WCAG indicado? `grande` = texto grande
 * (≥18pt, o ≥14pt en negrita), que tiene un umbral más laxo.
 * Devuelve false si algún color es inválido (fail-safe: bloquea la publicación).
 */
export function cumpleContraste(
  primerPlano: string,
  fondo: string,
  opciones: { nivel?: NivelWCAG; grande?: boolean } = {},
): boolean {
  const { nivel = 'AA', grande = false } = opciones;
  const ratio = ratioContraste(primerPlano, fondo);
  if (ratio === null) return false;
  const umbral = UMBRAL_CONTRASTE[nivel][grande ? 'grande' : 'normal'];
  return ratio >= umbral;
}

/** Negro o blanco: el que más contraste haga sobre el fondo dado. */
export function foregroundParaFondo(fondo: string): string {
  const conNegro = ratioContraste('#131313', fondo) ?? 0;
  const conBlanco = ratioContraste('#FFFFFF', fondo) ?? 0;
  return conBlanco >= conNegro ? '#FFFFFF' : '#131313';
}
