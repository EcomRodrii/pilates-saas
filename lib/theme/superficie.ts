// Qué color de texto va sobre un fondo, decidido en el RENDER y no confiado.
//
// El problema real: `EstiloBloque.fondo` deja que la propietaria le ponga a un
// bloque el color que quiera, y hasta ahora el texto encima seguía siendo el
// del tema (`estilo?.color ?? t.ink`). Un fondo oscuro con el texto oscuro del
// tema es un bloque ilegible, y nada se lo decía: el gate de contraste solo
// mira los colores DEL TEMA al publicarlo, no los de cada bloque.
//
// La regla es la del tema de referencia, en tres pasos:
//   1. si hay color de texto explícito, gana — la propietaria manda;
//   2. si no, el color del tema SI CONTRASTA (WCAG AA, 4.5:1) — así un fondo
//      suave conserva el carácter del tema en vez de saltar a negro puro;
//   3. si no, el extremo (claro u oscuro) que sí contraste.
//
// El paso 2 es el que hace que esto no se note cuando no hace falta: un fondo
// crema sobre un tema oliva sigue escribiendo en verde oscuro, no en negro.

import { cumpleContraste, foregroundParaFondo } from '../wcag-contrast.ts';

/** Opacidad del texto secundario sobre un fondo propio. Mismo criterio que
 *  `--color-foreground-muted` del tema de referencia: el secundario se deriva
 *  del principal, no es un color aparte que pueda dejar de contrastar. */
const OPACIDAD_SECUNDARIO = 0.72;

export function textoSobre(fondo: string, colorDelTema: string): string {
  return cumpleContraste(colorDelTema, fondo) ? colorDelTema : foregroundParaFondo(fondo);
}

/**
 * Los dos colores de texto de un bloque, ya resueltos.
 *
 * ⚠️ Sin `fondo` devuelve EXACTAMENTE lo de siempre. Eso importa: la inmensa
 * mayoría de bloques no tienen fondo propio y no deben cambiar ni un píxel.
 */
export function coloresDe(
  estilo: { fondo?: string | null; color?: string | null } | undefined,
  tema: { ink: string; muted: string },
): { ink: string; muted: string } {
  const explicito = estilo?.color ?? undefined;
  if (!estilo?.fondo) {
    return { ink: explicito ?? tema.ink, muted: explicito ?? tema.muted };
  }
  if (explicito) return { ink: explicito, muted: conOpacidad(explicito, OPACIDAD_SECUNDARIO) };
  const ink = textoSobre(estilo.fondo, tema.ink);
  // El secundario se deriva del principal en vez de arrastrar el `muted` del
  // tema: si el principal ha tenido que saltar a claro por el fondo, un
  // secundario oscuro heredado sería aún menos legible que el principal.
  const muted = ink === tema.ink ? tema.muted : conOpacidad(ink, OPACIDAD_SECUNDARIO);
  return { ink, muted };
}

/** `#RRGGBB` → `rgba(...)`. Devuelve el hex tal cual si no lo entiende: un
 *  color a medio teclear no debe dejar el texto sin color. */
export function conOpacidad(hex: string, alfa: number): string {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alfa})`;
}
