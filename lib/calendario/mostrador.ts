// ─────────────────────────────────────────────────────────────────────────────
// El modo mostrador: en el iPad de recepción, la ficha de la clase de AHORA
// abierta sin que nadie la busque, y ‹ › para pasar a la de antes o la de
// después sin cerrarla.
//
// «La de ahora» es la que recibe a la gente que entra por la puerta: la que
// tiene el check-in abierto (desde una hora antes, como la puerta con QR) y
// empieza más cerca de este minuto. A las 10:55, con una clase en curso desde
// las 10:30 y otra que empieza a las 11:00, quien entra viene a la de las 11.
//
// Import relativo con extensión `.ts`: lo prueba `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

import { MINUTOS_ANTES_DE_EMPEZAR } from '../acceso/evaluar-acceso.ts';

export interface ClaseDelDia {
  id: string;
  inicio: string;
  fin: string;
  cancelada: boolean;
}

const MIN = 60_000;

// Dos clases a la misma hora (una por sala) empatan: se desempata por id, no
// por el orden en que llegan. La consulta no ordena, y si al volver a pedirla
// llegaban al revés, la ficha del mostrador saltaba de una a otra sola.
function antes(a: ClaseDelDia, b: ClaseDelDia, clave: (c: ClaseDelDia) => number): boolean {
  const ka = clave(a), kb = clave(b);
  return ka < kb || (ka === kb && a.id < b.id);
}

/** La clase que el mostrador enseña sola; null si hoy ya no queda ninguna. */
export function claseDelMostrador(clases: readonly ClaseDelDia[], ahora: Date): string | null {
  const t = ahora.getTime();
  const vivas = clases.filter(c => !c.cancelada && t < Date.parse(c.fin));
  const abiertas = vivas.filter(c => t >= Date.parse(c.inicio) - MINUTOS_ANTES_DE_EMPEZAR * MIN);
  if (abiertas.length > 0) {
    const distancia = (c: ClaseDelDia) => Math.abs(Date.parse(c.inicio) - t);
    return abiertas.reduce((mejor, c) => (antes(c, mejor, distancia) ? c : mejor)).id;
  }
  return siguienteClase(vivas, ahora);
}

/** La primera clase que todavía no ha empezado. */
export function siguienteClase(clases: readonly ClaseDelDia[], ahora: Date): string | null {
  const t = ahora.getTime();
  const inicio = (c: ClaseDelDia) => Date.parse(c.inicio);
  let mejor: ClaseDelDia | null = null;
  for (const c of clases) {
    if (c.cancelada || inicio(c) <= t) continue;
    if (!mejor || antes(c, mejor, inicio)) mejor = c;
  }
  return mejor?.id ?? null;
}

/** La de antes y la de después en el orden en que se ven. */
export function vecinas(orden: readonly string[], id: string | null): { anterior: string | null; siguiente: string | null } {
  const i = id ? orden.indexOf(id) : -1;
  if (i < 0) return { anterior: null, siguiente: null };
  return { anterior: orden[i - 1] ?? null, siguiente: orden[i + 1] ?? null };
}
