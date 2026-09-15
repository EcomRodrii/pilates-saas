// ─────────────────────────────────────────────────────────────────────────────
// El calendario en el móvil: Día y Semana como LISTA por hora, no como rejilla.
//
// Puro y sin datos propios: ordena las MISMAS columnas que ya pinta la rejilla
// (`prepararColumnasDiaSemana` / `prepararColumnasSalaDia`), así que filtros,
// búsqueda y estado de cada clase son los de siempre. Solo decide el orden en
// que se leen.
// ─────────────────────────────────────────────────────────────────────────────

import type { ColumnaDia, ColumnaSala, SesionEnColumna } from './calendario-columnas.ts';

export interface DiaAgenda {
  /** Índice de la columna (0 = primer día de la ventana visible). */
  indice: number;
  cerrado: boolean;
  /** Ids de las clases de ese día, en orden de lectura. */
  ids: string[];
}

/**
 * Orden de lectura: por hora de inicio; a la misma hora, primero la que acaba
 * antes; y si también coinciden, el orden de las salas (el mismo que las
 * columnas de la vista de Día), para que la lista no baile entre recargas.
 */
function porHora(ordenSala: Map<string, number>) {
  return (a: SesionEnColumna, b: SesionEnColumna) =>
    a.inicioMin - b.inicioMin
    || a.finMin - b.finMin
    || (ordenSala.get(a.salaId) ?? Number.MAX_SAFE_INTEGER) - (ordenSala.get(b.salaId) ?? Number.MAX_SAFE_INTEGER)
    || a.id.localeCompare(b.id);
}

/** La semana, día a día. Un día cerrado o sin clases sigue en la lista: es un día de la semana. */
export function agendaDeSemana(columnas: ColumnaDia[], ordenSalas: string[] = []): DiaAgenda[] {
  const orden = porHora(new Map(ordenSalas.map((id, i) => [id, i])));
  return columnas.map((c, indice) => ({
    indice,
    cerrado: c.cerrado,
    ids: [...c.sesiones].sort(orden).map((s) => s.id),
  }));
}

/** Un día: las clases de todas sus salas juntas, por hora. */
export function agendaDeDia(columnas: ColumnaSala[]): string[] {
  const orden = porHora(new Map(columnas.map((c, i) => [c.sala.id, i])));
  return columnas.flatMap((c) => c.sesiones).sort(orden).map((s) => s.id);
}
