// ═══════════════════════════════════════════════════════════════════════════
// Utilidades de color (HSL) para el editor white-label
// ═══════════════════════════════════════════════════════════════════════════
//
// Permiten al editor ser "rico" sin pedir 5 hex a ciegas: el usuario elige 1-2
// colores y el resto de la paleta se deriva de forma armónica (derivarPaleta).
// Puro, sin dependencias de runtime → importable en cliente y testeable en node.

import { hexARgb, cumpleContraste } from './wcag-contrast.ts';

export type Hsl = { h: number; s: number; l: number };

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** hex (#RGB/#RRGGBB) → HSL (h 0-360, s/l 0-100). null si el hex es inválido. */
export function hexToHsl(hex: string): Hsl | null {
  const rgb = hexARgb(hex);
  if (!rgb) return null;
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
}

function hue2rgb(p: number, q: number, t: number): number {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

/** HSL → hex (#RRGGBB en mayúsculas). Normaliza fuera de rango. */
export function hslToHex(hsl: Hsl): string {
  const h = ((((hsl.h % 360) + 360) % 360) / 360);
  const s = clamp(hsl.s, 0, 100) / 100;
  const l = clamp(hsl.l, 0, 100) / 100;
  let r: number;
  let g: number;
  let b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  const to = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase();
}

/** Aclara (deltaL>0) u oscurece (deltaL<0) un color en puntos de luminosidad HSL. */
export function ajustarLuminosidad(hex: string, deltaL: number): string {
  const hsl = hexToHsl(hex);
  if (!hsl) return hex;
  return hslToHex({ ...hsl, l: clamp(hsl.l + deltaL, 0, 100) });
}

export interface PaletaDerivada {
  secondary: string;
  accent: string;
  background: string;
  text: string;
}

/**
 * Deriva una paleta armónica (monocromática con el matiz de la marca) a partir
 * del color primario: un secundario más oscuro y algo desaturado, un acento muy
 * claro (fondos suaves), un fondo casi blanco con un toque del matiz y un texto
 * casi negro con el mismo toque. El par texto/fondo cumple contraste alto.
 */
export function derivarPaleta(primary: string): PaletaDerivada {
  const hsl = hexToHsl(primary);
  if (!hsl) {
    return { secondary: '#5A6142', accent: '#F1F2EA', background: '#EEEEE8', text: '#1A1A1A' };
  }
  return {
    secondary: hslToHex({ h: hsl.h, s: clamp(hsl.s * 0.6, 12, 60), l: clamp(hsl.l * 0.55, 26, 46) }),
    accent: hslToHex({ h: hsl.h, s: clamp(hsl.s * 0.5, 10, 45), l: 95 }),
    background: hslToHex({ h: hsl.h, s: 12, l: 96 }),
    text: hslToHex({ h: hsl.h, s: 15, l: 12 }),
  };
}

/**
 * Un color, garantizado legible como TEXTO sobre un fondo casi blanco — el uso
 * real de `--brand-secondary` en el PANEL (badges, pestañas activas, iconos;
 * nunca relleno sólido). En los temas de la galería (Oliva/Bloom/Noir), ese
 * mismo campo `secondary` tiene otro papel — "superficie suave", no texto — y
 * puede ser deliberadamente pastel; `destacado` tampoco sirve de sustituto
 * genérico (en Bloom es un rosa claro pensado para ir SOBRE la marca, no sobre
 * blanco). Por eso esto no reemplaza el valor del tema: se aplica solo en el
 * punto donde `--brand-secondary` se convierte en texto del panel, oscureciendo
 * progresivamente hasta cumplir AA si hace falta. Un hex inválido nunca sale
 * tal cual (dejaría `--brand-secondary` con un valor CSS roto): cae al oscuro
 * por defecto, igual que el resto de fallbacks de este módulo.
 */
export function colorLegibleSobreClaro(hex: string): string {
  if (cumpleContraste(hex, '#FFFFFF', { grande: true })) return hex;
  for (let delta = -10; delta >= -70; delta -= 10) {
    const candidato = ajustarLuminosidad(hex, delta);
    if (cumpleContraste(candidato, '#FFFFFF', { grande: true })) return candidato;
  }
  return '#131313';
}
