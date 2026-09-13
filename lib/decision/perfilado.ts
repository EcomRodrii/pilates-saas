// Oposición al perfilado (art. 21 RGPD, `socios.excluir_de_perfilado`).
//
// La alumna puede pedir desde su app que sus datos no se usen para las
// recomendaciones automáticas del estudio. Aquí se hace valer DENTRO del motor:
// ninguna candidata que la señale a ella (socioId) sobrevive, y la memoria no
// aprende hechos nuevos sobre ella.
//
// ⚠️ Lo que NO se hace, a propósito: sacarla del snapshot. Las cifras AGREGADAS
// del estudio (ocupación, ingresos, nº de socias activas) no la perfilan a ella
// y sin su fila saldrían mal para todo el estudio — que una clase va llena lo
// sigue estando aunque una de las que va se haya opuesto.
//
// ⚠️ La lista de excluidas NO sale del snapshot, que se cachea 24 h
// (snapshot-cache.ts): llega aparte y fresca en cada pasada, así que un
// «no» dado hoy se respeta en el análisis siguiente, no mañana.
//
// Puro y sin I/O, para poder probarlo con node --test.

export interface ConSocia {
  socioId?: string | null;
}

/** Quita las candidatas (o hechos de memoria) que señalan a una socia opuesta. */
export function sinSociasOpuestas<T extends ConSocia>(items: T[], excluidas: ReadonlySet<string>): T[] {
  if (excluidas.size === 0) return items;
  return items.filter(it => !it.socioId || !excluidas.has(it.socioId));
}
