// Las columnas extra de la tabla de Clientas (P2.8): solo en escritorio, todas
// apagadas de serie, y la elección se guarda EN ESTE NAVEGADOR por persona y
// estudio (el iPad de recepción lo comparten varias). Con try/catch: sin
// almacenamiento (privado, bloqueado) se queda lo de serie. Puro, sin `@/`.
//
// Sin columnas de salud ni de dinero: la salud tiene su cerradura en la base de
// datos (y su punto de color en la fila); el dinero no lo lee la gerencia.

export const COLUMNAS_EXTRA = [
  { id: 'frecuencia', titulo: 'Clases por semana' },
  { id: 'constancia', titulo: 'Constancia' },
  { id: 'desde', titulo: 'Clienta desde' },
  { id: 'telefono', titulo: 'Teléfono' },
  { id: 'email', titulo: 'Email' },
] as const;

export type ColumnaExtra = (typeof COLUMNAS_EXTRA)[number]['id'];
const IDS = new Set<string>(COLUMNAS_EXTRA.map(c => c.id));

/** v1: si la forma cambia, se sube y lo viejo se ignora. */
export function claveColumnas(uid: string, studioId: string): string {
  return `tentare:clientas-columnas:v1:${uid}:${studioId}`;
}

interface Almacen { getItem(k: string): string | null; setItem(k: string, v: string): void }

export function leerColumnas(almacen: Almacen | null | undefined, clave: string): ColumnaExtra[] {
  try {
    const crudo = almacen?.getItem(clave);
    if (!crudo) return [];
    const lista = JSON.parse(crudo) as unknown;
    if (!Array.isArray(lista)) return [];
    // Solo ids conocidos, sin repetir y en el orden del catálogo.
    return COLUMNAS_EXTRA.map(c => c.id).filter(id => lista.includes(id) && IDS.has(id));
  } catch {
    return [];
  }
}

export function guardarColumnas(almacen: Almacen | null | undefined, clave: string, columnas: readonly ColumnaExtra[]): void {
  try {
    almacen?.setItem(clave, JSON.stringify(columnas));
  } catch {
    // Sin almacenamiento: vale para esta visita y nada más.
  }
}
