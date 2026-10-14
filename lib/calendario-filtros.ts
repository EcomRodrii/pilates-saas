// ─────────────────────────────────────────────────────────────────────────────
// Rediseño del Calendario — punto 9: filtro por sala reduce columnas (ya lo
// hace `prepararColumnasSalaDia`/el pre-filtro de sesiones antes de agrupar
// por semana, con el propio salaId); el filtro por instructora NUNCA esconde
// — atenúa, para no perder el contexto del estudio (I-9: antes el filtro
// ocultaba sesiones enteras, ver `filtroInstructor` en el page.tsx viejo).
// Puro: una sola regla, la misma para vista de Día y de Semana.
// ─────────────────────────────────────────────────────────────────────────────

/** '' = sin filtro (nada se atenúa). Una clase sin instructora asignada
 *  también se atenúa con un filtro activo: no es la instructora elegida. */
export function claseAtenuadaPorInstructor(instructorId: string | null, filtroInstructorId: string): boolean {
  if (!filtroInstructorId) return false;
  return instructorId !== filtroInstructorId;
}

// ── La columna del calendario (panel nuevo, como la de Bonsai) ───────────────
// Cada clase y cada instructora con su ojo. Mismo criterio que arriba: cerrar el
// ojo ATENÚA, nunca esconde (I-9). La instructora tiene además el desplegable de
// siempre (un solo nombre); los dos conviven: con el desplegable puesto, en la
// columna solo ella tiene el ojo abierto, y tocar un ojo pasa a la columna.

export interface FiltrosColumna {
  tiposApagados: ReadonlySet<string>;
  instructorasApagadas: ReadonlySet<string>;
  /** Como «Solo con inscripciones» de Bonsai: atenúa las clases sin nadie apuntado. */
  soloConApuntadas: boolean;
}

export const SIN_FILTROS_COLUMNA: FiltrosColumna = {
  tiposApagados: new Set(), instructorasApagadas: new Set(), soloConApuntadas: false,
};

export function claseAtenuadaPorColumna(
  c: { tipoClaseId: string; instructorId: string | null; apuntadas: number },
  f: FiltrosColumna,
): boolean {
  if (f.tiposApagados.has(c.tipoClaseId)) return true;
  if (c.instructorId && f.instructorasApagadas.has(c.instructorId)) return true;
  if (f.soloConApuntadas && c.apuntadas === 0) return true;
  return false;
}

/** Si el ojo de esta instructora está cerrado, con el desplegable o con la columna. */
export function instructoraApagada(id: string, filtroInstructorId: string, apagadas: ReadonlySet<string>): boolean {
  return filtroInstructorId ? id !== filtroInstructorId : apagadas.has(id);
}

/**
 * Tocar el ojo de una instructora. Con el desplegable puesto, lo que se veía
 * (solo ella) pasa a la columna y se cambia ese ojo; el desplegable se vacía.
 */
export function alternarInstructora(
  id: string, todas: readonly string[], filtroInstructorId: string, apagadas: ReadonlySet<string>,
): { apagadas: Set<string>; filtroInstructorId: '' } {
  const base = filtroInstructorId ? new Set(todas.filter(x => x !== filtroInstructorId)) : new Set(apagadas);
  if (base.has(id)) base.delete(id); else base.add(id);
  return { apagadas: base, filtroInstructorId: '' };
}

export function alternarEnConjunto(conjunto: ReadonlySet<string>, id: string): Set<string> {
  const n = new Set(conjunto);
  if (n.has(id)) n.delete(id); else n.add(id);
  return n;
}
