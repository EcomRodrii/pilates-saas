// Paginación por cursor de la API pública (keyset, no OFFSET).
//
// Un programa de contabilidad recorre TODO un listado y luego vuelve a por lo
// nuevo. Con `offset` se salta filas o las repite si entre dos páginas entra un
// cobro; con un cursor sobre (columna de orden, id) no: cada página empieza
// justo después de la última fila que se devolvió.
//
// El cursor es opaco para el integrador (base64url de un JSON) y se valida al
// leerlo: un cursor manipulado es un 400, nunca una consulta con un valor
// arbitrario.

export interface Cursor {
  /** Valor de la columna de orden de la última fila devuelta. */
  v: string;
  /** Id de esa fila (desempate). */
  id: string;
}

const MAX_LARGO = 400;
// Fechas 'YYYY-MM-DD' o instantes ISO; ids como los genera `uid()`. Nada de
// comas, puntos sueltos ni paréntesis: no pueden romper el filtro de PostgREST.
const RE_VALOR = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})?)?$/;
const RE_ID = /^[0-9A-Za-z_-]{1,120}$/;

export function codificarCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify([c.v, c.id]), 'utf8').toString('base64url');
}

/** `null` si no hay cursor; `'invalido'` si no se puede leer o trae algo raro. */
export function decodificarCursor(texto: string | null | undefined): Cursor | null | 'invalido' {
  if (!texto) return null;
  if (texto.length > MAX_LARGO) return 'invalido';
  try {
    const crudo = JSON.parse(Buffer.from(texto, 'base64url').toString('utf8')) as unknown;
    if (!Array.isArray(crudo) || crudo.length !== 2) return 'invalido';
    const [v, id] = crudo;
    if (typeof v !== 'string' || typeof id !== 'string') return 'invalido';
    if (!RE_VALOR.test(v) || !RE_ID.test(id)) return 'invalido';
    return { v, id };
  } catch {
    return 'invalido';
  }
}

/**
 * El filtro PostgREST para «después de este cursor» en el orden pedido por
 * (columna, id): en ascendente `columna > v OR (columna = v AND id > idCursor)`,
 * y al revés en descendente. Los valores ya vienen validados por
 * `decodificarCursor` (sin comas ni paréntesis), así que no pueden romper la
 * expresión.
 */
export function filtroDespuesDe(columna: string, c: Cursor, orden: 'asc' | 'desc' = 'asc'): string {
  const op = orden === 'asc' ? 'gt' : 'lt';
  return `${columna}.${op}.${c.v},and(${columna}.eq.${c.v},id.${op}.${c.id})`;
}

export type Orden = 'asc' | 'desc';

/** `desc` (lo más reciente primero, como la v1 de siempre) salvo que se pida `asc`. */
export function leerOrden(texto: string | null): Orden | 'invalido' {
  if (texto == null || texto === '' || texto === 'desc') return 'desc';
  return texto === 'asc' ? 'asc' : 'invalido';
}

export const LIMITE_POR_DEFECTO = 50;
export const LIMITE_MAXIMO = 200;

/**
 * Tolerante a propósito, como la v1 de siempre (`Number(x) || 25`): un valor
 * raro cae en el de por defecto en vez de dar 400 a una integración que ya
 * funcionaba. Nunca pasa de LIMITE_MAXIMO.
 */
export function leerLimite(texto: string | null, porDefecto: number = LIMITE_POR_DEFECTO): number {
  const n = Math.floor(Number(texto));
  if (texto == null || texto === '' || !Number.isFinite(n) || n < 1) return porDefecto;
  return Math.min(n, LIMITE_MAXIMO);
}

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Una fecha 'YYYY-MM-DD' válida, `null` si no viene, `'invalido'` si viene mal. */
export function leerFecha(texto: string | null): string | null | 'invalido' {
  if (texto == null || texto === '') return null;
  if (!RE_FECHA.test(texto)) return 'invalido';
  const [y, m, d] = texto.split('-').map(Number);
  const f = new Date(Date.UTC(y, m - 1, d));
  if (f.getUTCFullYear() !== y || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return 'invalido';
  return texto;
}
