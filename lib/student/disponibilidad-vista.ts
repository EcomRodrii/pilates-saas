// ─────────────────────────────────────────────────────────────────────────────
// Lo que enseña «Tu disponibilidad» encima de la rejilla, y el atajo de marcar
// un día entero. Las celdas son las claves de `lib/sustituciones/franjas.ts`
// («1-manana» = lunes a primera hora).
//
// Puro y sin dependencias: se prueba con `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

export interface ResumenDisponibilidad {
  /** Franjas marcadas en la semana. */
  franjas: number;
  /** Días con al menos una franja. */
  dias: number;
}

export function resumenDisponibilidad(celdas: Iterable<string>): ResumenDisponibilidad {
  const unicas = new Set(celdas);
  const dias = new Set([...unicas].map((c) => c.split('-')[0]));
  return { franjas: unicas.size, dias: dias.size };
}

/** «Puedes cubrir 8 franjas en 4 días». Sin franjas, `null`: eso se dice aparte. */
export function textoResumenDisponibilidad(r: ResumenDisponibilidad): string | null {
  if (r.franjas === 0) return null;
  const franjas = `${r.franjas} ${r.franjas === 1 ? 'franja' : 'franjas'}`;
  const dias = `${r.dias} ${r.dias === 1 ? 'día' : 'días'}`;
  return `Puedes cubrir ${franjas} en ${dias}`;
}

/** Si el día ya está entero, se vacía; si no, se completa. No toca los demás días. */
export function alternarDia(celdas: ReadonlySet<string>, dow: number, franjas: readonly string[]): Set<string> {
  const delDia = franjas.map((f) => `${dow}-${f}`);
  const entero = delDia.every((c) => celdas.has(c));
  const siguiente = new Set(celdas);
  for (const c of delDia) {
    if (entero) siguiente.delete(c); else siguiente.add(c);
  }
  return siguiente;
}

/**
 * ¿La respuesta de «leer disponibilidad» dice que no tiene NINGUNA franja?
 *
 * Solo `true` con una lista vacía explícita. Cualquier otra cosa —un error, un
 * cuerpo raro, `{}`— es «no lo sé», y con «no lo sé» no se encierra a nadie en
 * la pantalla de horarios: un fallo del servidor dejaría a la instructora sin
 * poder abrir su agenda.
 */
export function faltaDisponibilidad(cuerpo: unknown): boolean {
  if (typeof cuerpo !== 'object' || cuerpo === null) return false;
  const celdas = (cuerpo as { celdas?: unknown }).celdas;
  return Array.isArray(celdas) && celdas.length === 0;
}

export function diaEntero(celdas: ReadonlySet<string>, dow: number, franjas: readonly string[]): boolean {
  return franjas.every((f) => celdas.has(`${dow}-${f}`));
}
