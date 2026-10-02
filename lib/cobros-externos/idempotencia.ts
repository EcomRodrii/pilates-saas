// ─────────────────────────────────────────────────────────────────────────────
// Que el mismo movimiento no entre dos veces.
//
// Cada movimiento lleva una `clave_idempotencia`, única por estudio en la base
// de datos (`UNIQUE (studio_id, clave_idempotencia)` + `ON CONFLICT DO NOTHING`).
// Subir dos veces el mismo fichero, o dos ficheros que se solapan, genera las
// mismas claves y no entra nada repetido.
//
// El caso difícil es Norma 43: no trae un id por movimiento. La clave se hace
// con todo lo que lo describe y, al final, `#<n>`: el número de aparición de esa
// MISMA línea en su cuenta y su día, en el orden del fichero. Así dos Bizum
// idénticos de la misma persona el mismo día entran como `#1` y `#2`, y no como
// un duplicado que se come el segundo pago.
//
// Puro.
// ─────────────────────────────────────────────────────────────────────────────

import { createHash } from 'node:crypto';
import type { MovimientoN43 } from './norma43.ts';

const hash = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

/** Lo que identifica una línea de Norma 43, sin el número de aparición. */
export function firmaN43(m: MovimientoN43): string {
  return hash([
    m.cuentaClave, m.fechaOperacion, m.fechaValor, m.conceptoComun, m.conceptoPropio,
    m.importeCentimos, m.documento, m.referencia1, m.referencia2, m.conceptos.join('|'),
  ].join('\u0000')).slice(0, 40);
}

export function claveNorma43(m: MovimientoN43, aparicion: number): string {
  return `n43:${firmaN43(m)}#${aparicion}`;
}

/**
 * El número de aparición de cada elemento entre los que tienen su misma firma,
 * en el orden en que vienen (1, 2, 3…). Va por firma, que ya incluye la cuenta y
 * el día.
 */
export function apariciones<T>(elementos: readonly T[], firma: (e: T) => string): number[] {
  const vistos = new Map<string, number>();
  return elementos.map(e => {
    const f = firma(e);
    const n = (vistos.get(f) ?? 0) + 1;
    vistos.set(f, n);
    return n;
  });
}

/**
 * CSV o Excel: con una columna de id de la operación, el id manda; sin ella, la
 * misma idea que Norma 43 con las columnas elegidas.
 */
export function claveTabla(p: { plantilla: string; idOperacion: string | null; campos: readonly (string | number | null)[] }, aparicion: number): string {
  if (p.idOperacion) return `tab:${hash(`${p.plantilla}\u0000${p.idOperacion}`).slice(0, 40)}`;
  return `tab:${hash([p.plantilla, ...p.campos.map(c => c ?? '')].join('\u0000')).slice(0, 40)}#${aparicion}`;
}

/**
 * Huella del contenido normalizado de un fichero: el mismo fichero, aunque se
 * guarde otra vez, da la misma. Lleva la fuente, la cuenta y el periodo para que
 * dos ficheros sin abonos de cuentas o meses distintos no parezcan el mismo.
 */
export function huellaDeLote(p: { fuente: string; cuentaFinal: string | null; periodoDesde: string | null; periodoHasta: string | null; claves: readonly string[] }): string {
  return hash([p.fuente, p.cuentaFinal ?? '', p.periodoDesde ?? '', p.periodoHasta ?? '', ...[...p.claves].sort()].join('\n'));
}
