// Los sitios (camas, reformers, esterillas) que se pueden elegir en una sala. Puro y sin imports.
//
// Una sola regla para quien la necesita: la hoja de la ficha (`huecosDeClase`, para dejar elegir sitio) y la proyección
// del horario (`salaConSitios`, para NO ofrecer «Reservar» desde la fila: elegir sitio solo se hace desde la ficha).

/** Los sitios activos de esa sala. Un sitio sin `activo` cuenta (lo de siempre); uno con `activo: false`, no. */
export function spotsActivosDeLaSala<T extends { salaId: string; activo?: boolean | null }>(spots: readonly T[] | null | undefined, salaId: string): T[] {
  return (spots ?? []).filter((s) => s.salaId === salaId && s.activo !== false);
}
