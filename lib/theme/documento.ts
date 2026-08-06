// El documento de una pantalla: MAPA de bloques + ARRAY de orden.
//
// Hoy una pantalla se guarda como un array plano, donde identidad y posición
// son la misma cosa. Eso hace imposibles tres operaciones que cualquier editor
// de temas serio tiene:
//
//  · **duplicar** — necesita generar una identidad nueva sin tocar el resto;
//  · **restaurar** lo borrado — con un array, borrar pierde la configuración;
//  · **reordenar sin reescribir los datos** — mover es cambiar el array entero.
//
// El tema de referencia lo resuelve separando las dos cosas: `sections` (mapa
// id → instancia) + `order` (array de ids), recursivamente en cada nivel. Un id
// que está en el mapa pero NO en el orden simplemente no se renderiza — y esa
// es exactamente su papelera.
//
// ⚠️ Este módulo es PURO y no toca la persistencia. El jsonb sigue guardándose
// como array: `desdeArray`/`aArray` son el puente. Cambiar lo que se guarda es
// la segunda mitad de esta etapa y necesita migración de datos, así que va
// aparte a propósito — el modelo se estabiliza primero con consumidores reales.

import type { BloqueHome } from '../portal-home-bloques.ts';

export interface Documento {
  /** Todas las instancias, vivas y en la papelera. La identidad vive aquí. */
  bloques: Record<string, BloqueHome>;
  /** Qué se renderiza y en qué orden. La posición vive aquí. */
  orden: string[];
}

export function desdeArray(bloques: BloqueHome[]): Documento {
  const mapa: Record<string, BloqueHome> = {};
  for (const b of bloques) mapa[b.id] = b;
  // `Object.keys` no garantiza orden para claves numéricas, así que el orden
  // sale del array de entrada y nunca del mapa.
  return { bloques: mapa, orden: bloques.map((b) => b.id) };
}

/** Lo que se renderiza, en orden. Un id del orden sin bloque se ignora. */
export function aArray(doc: Documento): BloqueHome[] {
  return doc.orden.map((id) => doc.bloques[id]).filter((b): b is BloqueHome => b !== undefined);
}

/** Los que están en el mapa pero fuera del orden: la papelera. */
export function enPapelera(doc: Documento): BloqueHome[] {
  const vivos = new Set(doc.orden);
  return Object.values(doc.bloques).filter((b) => !vivos.has(b.id));
}

/**
 * Saca un bloque del orden SIN borrar su instancia. Es la diferencia con un
 * array: la configuración sobrevive y `restaurar` la devuelve entera.
 */
export function quitar(doc: Documento, id: string): Documento {
  return { ...doc, orden: doc.orden.filter((x) => x !== id) };
}

/** Devuelve al orden algo que estaba en la papelera, al final. */
export function restaurar(doc: Documento, id: string): Documento {
  if (!doc.bloques[id] || doc.orden.includes(id)) return doc;
  return { ...doc, orden: [...doc.orden, id] };
}

/** Borra de verdad: del orden Y del mapa. Sin vuelta atrás. */
export function borrarDeVerdad(doc: Documento, id: string): Documento {
  const { [id]: _fuera, ...resto } = doc.bloques;
  return { bloques: resto, orden: doc.orden.filter((x) => x !== id) };
}

/**
 * Copia un bloque justo detrás del original, con identidad nueva. Los hijos
 * también se copian con ids nuevos: si compartieran id con los del original,
 * seleccionar uno en el editor marcaría los dos.
 */
export function duplicar(doc: Documento, id: string, nuevoId: () => string): { doc: Documento; id: string | null } {
  const original = doc.bloques[id];
  if (!original) return { doc, id: null };
  const copiaId = nuevoId();
  const copia = {
    ...original,
    id: copiaId,
    ...(original.kind !== 'sistema' && original.hijos
      ? { hijos: original.hijos.map((h) => ({ ...h, id: nuevoId() })) }
      : {}),
  } as BloqueHome;
  const i = doc.orden.indexOf(id);
  const orden = i < 0 ? [...doc.orden, copiaId] : [...doc.orden.slice(0, i + 1), copiaId, ...doc.orden.slice(i + 1)];
  return { doc: { bloques: { ...doc.bloques, [copiaId]: copia }, orden }, id: copiaId };
}

/** Mueve a una posición absoluta del orden. Acotada, nunca fuera de rango. */
export function mover(doc: Documento, id: string, destino: number): Documento {
  const i = doc.orden.indexOf(id);
  if (i < 0) return doc;
  const sinEl = doc.orden.filter((x) => x !== id);
  const j = Math.max(0, Math.min(destino, sinEl.length));
  return { ...doc, orden: [...sinEl.slice(0, j), id, ...sinEl.slice(j)] };
}

/** Reemplaza una instancia conservando su posición. */
export function sustituir(doc: Documento, bloque: BloqueHome): Documento {
  if (!doc.bloques[bloque.id]) return doc;
  return { ...doc, bloques: { ...doc.bloques, [bloque.id]: bloque } };
}
