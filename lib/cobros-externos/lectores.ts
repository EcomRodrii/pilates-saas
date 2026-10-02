// ─────────────────────────────────────────────────────────────────────────────
// De un fichero a movimientos normalizados, sea cual sea su formato.
// Puro: el texto llega ya decodificado (`decodificarExtracto`) y el Excel, ya en
// filas desde el navegador.
// ─────────────────────────────────────────────────────────────────────────────

import type { ResultadoLectura } from './tipos.ts';
import { contarCargosN43, esNorma43, leerNorma43 } from './norma43.ts';
import { normalizarN43 } from './clasificar.ts';
import { apariciones, firmaN43 } from './idempotencia.ts';

export type FormatoTexto = 'norma43' | 'csv';

/** El formato de un fichero de texto. Lo que no es Norma 43 se trata como CSV. */
export function detectarFormato(texto: string): FormatoTexto {
  return esNorma43(texto) ? 'norma43' : 'csv';
}

export type LecturaFichero = { ok: true; lectura: ResultadoLectura } | { ok: false; errores: { linea: number; codigo: string }[] };

export function leerFicheroNorma43(texto: string): LecturaFichero {
  const l = leerNorma43(texto);
  if (!l.ok) return { ok: false, errores: l.errores };
  const ns = apariciones(l.movimientos, firmaN43);
  return {
    ok: true,
    lectura: {
      movimientos: l.movimientos.map((m, i) => normalizarN43(m, ns[i])),
      cargos: contarCargosN43(texto),
      errores: l.errores,
      cuentaFinal: l.movimientos[0]?.cuentaFinal ?? null,
      periodoDesde: l.periodoDesde,
      periodoHasta: l.periodoHasta,
    },
  };
}
