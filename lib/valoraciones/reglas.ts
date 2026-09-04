// Reglas puras de valoración. Sin imports ni `@/`: `node --test
// --experimental-strip-types` no resuelve ese alias y el test dejaría de
// ejecutarse sin fallar.

/** Estado de `reservas.estado` tal cual llega de la tabla. */
export type ResultadoPuedeValorar =
  | { ok: true }
  | { ok: false; motivo: 'sin-reserva' | 'no-asistida' };

/**
 * Solo se valora una clase a la que se ha ASISTIDO. Una reserva confirmada de
 * una clase que ya pasó no vale: el estudio marca la asistencia, y hasta
 * entonces no hay nada que valorar. Es la regla de producto, y va en el
 * servidor: la pantalla la refleja, no la decide.
 */
export function puedeValorarReserva(estado: string | null | undefined): ResultadoPuedeValorar {
  if (!estado) return { ok: false, motivo: 'sin-reserva' };
  if (estado !== 'ASISTIDA') return { ok: false, motivo: 'no-asistida' };
  return { ok: true };
}

export interface ValoracionNormalizada { puntuacion: number; comentario: string | null }

/** 1-5 entero; comentario recortado a 500 y `null` si queda vacío. `null` si la nota no vale. */
export function normalizarValoracion(puntuacion: unknown, comentario: unknown): ValoracionNormalizada | null {
  const p = Number(puntuacion);
  if (!Number.isInteger(p) || p < 1 || p > 5) return null;
  const c = typeof comentario === 'string' ? comentario.trim().slice(0, 500) || null : null;
  return { puntuacion: p, comentario: c };
}
