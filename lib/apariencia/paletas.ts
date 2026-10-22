// ─────────────────────────────────────────────────────────────────────────────
// Las paletas listas del color de marca: «primero eliges una con nombre, luego
// afinas» (Bonsai b-32). Las usan «Apariencia de tu app»
// (components/apariencia/editor-apariencia-app.tsx) y el paso «Tu marca» del
// alta nueva (components/alta-nueva/paso-marca.tsx): una lista, no dos copias
// que diverjan.
//
// Son un color de marca como cualquier otro: al publicar pasan el mismo control
// de contraste que uno elegido a mano (`validarContrasteTheme`, en el servidor).
//
// Puro, sin `@/`.
// ─────────────────────────────────────────────────────────────────────────────

import { DEFAULT_THEME } from '../theme-schema.ts';
import { foregroundParaFondo, ratioContraste } from '../wcag-contrast.ts';

export interface PaletaMarca { nombre: string; color: string }

export const PALETAS: readonly PaletaMarca[] = [
  { nombre: 'Salvia', color: '#5E7A5A' },
  { nombre: 'Terracota', color: '#A85A3E' },
  { nombre: 'Lavanda', color: '#6E62A8' },
  { nombre: 'Océano', color: '#2F6F8F' },
  { nombre: 'Rosa empolvado', color: '#A85C72' },
  { nombre: 'Tinta', color: '#2E3440' },
];

/**
 * «De serie»: el color con el que nace el portal de un estudio (el `primary` de
 * `DEFAULT_THEME`). Sale del tema, no se escribe aquí: si la marca de fábrica
 * cambia, esto la sigue.
 */
export const PALETA_DE_SERIE: PaletaMarca = { nombre: 'De serie', color: DEFAULT_THEME.primary };

/** Para elegir en el alta: «De serie» primero y luego las de Apariencia. */
export const PALETAS_CON_DE_SERIE: readonly PaletaMarca[] = [PALETA_DE_SERIE, ...PALETAS];

/** La paleta que es ese color (sin mirar mayúsculas), si es una de las listas. */
export function paletaDeColor(color: string, paletas: readonly PaletaMarca[] = PALETAS_CON_DE_SERIE): PaletaMarca | null {
  const c = color.trim().toLowerCase();
  return paletas.find(p => p.color.toLowerCase() === c) ?? null;
}

const HEX6 = /^#[0-9a-fA-F]{6}$/;

/** ¿Es un color que se puede publicar (#RRGGBB)? */
export function colorValido(color: string): boolean {
  return HEX6.test(color.trim());
}

/**
 * El texto que va encima de su color en los botones, elegido solo para que se
 * lea (`foregroundParaFondo`, el mismo criterio del panel y de la fila de marca
 * del asistente), y cuánto contrasta. Se le DICE, no solo se aplica: «Botones
 * con texto blanco · 7,2:1 · se lee bien». `null` si el color no vale.
 */
export function contrasteDeBotones(color: string): { texto: string; nombre: 'blanco' | 'oscuro'; ratio: number; seLee: boolean; frase: string } | null {
  if (!colorValido(color)) return null;
  const texto = foregroundParaFondo(color);
  const ratio = ratioContraste(texto, color) ?? 0;
  const nombre = texto.toUpperCase() === '#FFFFFF' ? 'blanco' : 'oscuro';
  const seLee = ratio >= 4.5;
  const cifra = (Math.round(ratio * 10) / 10).toFixed(1).replace('.', ',');
  return { texto, nombre, ratio, seLee, frase: `Botones con texto ${nombre} · ${cifra}:1 · ${seLee ? 'se lee bien' : 'poco contraste'}` };
}
