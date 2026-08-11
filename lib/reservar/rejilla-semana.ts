// La rejilla semanal de la página pública: horas en filas, días en columnas.
//
// Todo lo que decide QUÉ se pinta vive aquí y sin React, porque son las reglas
// que se pueden equivocar en silencio: qué estado tiene una clase según sus
// plazas, y qué franjas horarias merecen una fila.

/** Estado de plazas de una clase, que es lo que le da color en la rejilla. */
export type EstadoPlazas = 'disponible' | 'ultimas' | 'lista-espera' | 'completa';

/** A partir de cuántas plazas libres se avisa de que quedan pocas. */
export const UMBRAL_ULTIMAS = 2;

export interface PlazasClase {
  ocupadas: number;
  aforoMaximo: number;
  /** Si el estudio deja apuntarse a la lista cuando no quedan plazas. */
  permiteListaEspera?: boolean;
}

/**
 * ⚠️ **«Completa» y «lista de espera» NO son el mismo estado**, y confundirlos
 * es lo que hace que una clase llena parezca un callejón sin salida cuando en
 * realidad puedes apuntarte. Es exactamente la diferencia que el diseño pinta
 * con dos colores distintos.
 *
 * `aforoMaximo <= 0` se trata como completa y no como «infinitas plazas»: un
 * aforo sin fijar es un dato incompleto, y ofrecer una reserva sobre él
 * terminaría en un error del servidor delante de la clienta.
 */
export function estadoPlazas({ ocupadas, aforoMaximo, permiteListaEspera }: PlazasClase): EstadoPlazas {
  if (aforoMaximo <= 0) return 'completa';
  const libres = aforoMaximo - ocupadas;
  if (libres <= 0) return permiteListaEspera ? 'lista-espera' : 'completa';
  return libres <= UMBRAL_ULTIMAS ? 'ultimas' : 'disponible';
}

/** Lo que la leyenda de la rejilla enseña, en el orden en que se lee. */
export const LEYENDA: readonly { estado: EstadoPlazas; etiqueta: string }[] = [
  { estado: 'disponible', etiqueta: 'Disponible' },
  { estado: 'ultimas', etiqueta: 'Últimas plazas' },
  { estado: 'lista-espera', etiqueta: 'Lista de espera' },
  { estado: 'completa', etiqueta: 'Completa' },
];

export interface ClaseEnRejilla {
  id: string;
  /** ISO del inicio. */
  inicio: string;
}

/**
 * Las franjas horarias que merecen una fila: **solo las que tienen alguna
 * clase**, ordenadas.
 *
 * Un estudio abre de 8 a 10 y de 17 a 21. Pintar las 24 horas —o incluso solo
 * de la primera a la última— dejaría siete filas vacías en medio y obligaría a
 * hacer scroll por la nada para llegar a la tarde. El diseño salta ese hueco, y
 * salta bien: la fila de las 10:00 va seguida de la de las 17:00.
 */
export function franjasConClases(clases: readonly ClaseEnRejilla[]): number[] {
  const horas = new Set<number>();
  for (const c of clases) {
    const d = new Date(c.inicio);
    if (Number.isNaN(d.getTime())) continue; // una fecha rota no inventa una fila
    horas.add(d.getHours());
  }
  return [...horas].sort((a, b) => a - b);
}

/**
 * ¿Hay un salto de horas entre esta franja y la anterior?
 *
 * La rejilla lo usa para marcar visualmente el corte (mañana / tarde) en vez de
 * dejar dos filas pegadas que parecen consecutivas y no lo son.
 */
export function haySaltoAntesDe(franjas: readonly number[], indice: number): boolean {
  if (indice <= 0) return false;
  return franjas[indice] - franjas[indice - 1] > 1;
}

/** `2026-08-12T18:30:00Z` → la columna (0 = lunes) y la hora de su fila. */
export function celdaDe(inicio: string): { diaSemana: number; hora: number } | null {
  const d = new Date(inicio);
  if (Number.isNaN(d.getTime())) return null;
  // `getDay()` es 0=domingo; la rejilla empieza en lunes, como el calendario
  // español que ya usa el resto del producto.
  return { diaSemana: (d.getDay() + 6) % 7, hora: d.getHours() };
}
