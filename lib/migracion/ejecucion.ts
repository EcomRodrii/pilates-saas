// Orden y dependencias al ejecutar una migración con varios archivos.
//
// Antes, en cuanto fallaba una entidad (p. ej. el horario) el bucle se cortaba
// con un `break`: lo que venía después ni se intentaba, ni aparecía en el acta.
// Una propietaria con 300 alumnas veía «300 clientas, 0 clases» y NO se enteraba
// de que sus 270 bonos tampoco habían entrado: todas figuraban «sin plan». Ahora
// una entidad solo se salta si lo que NECESITA falló, y el acta dice cuáles
// quedaron sin importar y por qué.

import type { EntidadMigracion } from './clasificador.ts';

/** Qué debe haber entrado antes (por email de la socia, por la clase…). */
export const DEPENDE_DE: Record<EntidadMigracion, EntidadMigracion[]> = {
  socias: [],
  clases: [],
  membresias: ['socias'],
  reservas: ['socias', 'clases'],
  citas: ['socias'],
  pagos: ['socias'],
  recuperaciones: ['socias'],
};

export type EstadoEntidad = 'importada' | 'parcial' | 'fallida' | 'no_importada';

/** Las entidades que NO se pueden intentar porque algo de lo que necesitan falló. */
export function bloqueadaPor(entidad: EntidadMigracion, fallidas: ReadonlySet<EntidadMigracion>): EntidadMigracion[] {
  return DEPENDE_DE[entidad].filter(d => fallidas.has(d));
}

export function estadoDeEntidad(r: { importadas: number; error?: string | null }): EstadoEntidad {
  if (!r.error) return 'importada';
  return r.importadas > 0 ? 'parcial' : 'fallida';
}

/** ¿Hay algo en el acta que no entró del todo? (error, entrada parcial o saltada). */
export function actaIncompleta(resultados: readonly { error?: string | null; estado?: EstadoEntidad }[]): boolean {
  return resultados.some(r => !!r.error || (r.estado !== undefined && r.estado !== 'importada'));
}
