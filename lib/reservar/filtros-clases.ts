// El rail de filtros de la página pública.
//
// Aquí vive lo único que puede engañar: QUÉ opciones se ofrecen. Un desplegable
// con una instructora que no da ninguna clase esta semana, o con un nivel que
// no existe en el horario, promete un resultado que no está — y el precio de
// probarlo lo paga la clienta con una lista vacía.

export interface ClaseFiltrable {
  tipoClaseId?: string | null;
  nivel?: string | null;
  instructorNombre?: string | null;
}

export interface OpcionFiltro {
  valor: string;
  etiqueta: string;
  /** Cuántas clases hay con esta opción. Se enseña junto a la etiqueta. */
  cuantas: number;
}

/**
 * Las opciones de un filtro, sacadas de las clases que HAY.
 *
 * ⚠️ **Del horario visible, no del catálogo del estudio.** Un estudio puede
 * tener ocho instructoras dadas de alta y solo tres dando clase esta semana:
 * ofrecer las ocho convierte cinco de ellas en un callejón sin salida. Lo
 * mismo con los niveles y los tipos de clase.
 *
 * Se ordena por frecuencia y luego alfabéticamente: lo que más hay, primero —
 * y el desempate estable para que la lista no baile entre renders.
 */
export function opcionesDe(
  clases: readonly ClaseFiltrable[],
  campo: (c: ClaseFiltrable) => string | null | undefined,
  etiquetar: (valor: string) => string = (v) => v,
): OpcionFiltro[] {
  const cuenta = new Map<string, number>();
  for (const c of clases) {
    const v = campo(c);
    if (!v) continue;
    cuenta.set(v, (cuenta.get(v) ?? 0) + 1);
  }
  return [...cuenta.entries()]
    .map(([valor, cuantas]) => ({ valor, etiqueta: etiquetar(valor), cuantas }))
    .sort((a, b) => b.cuantas - a.cuantas || a.etiqueta.localeCompare(b.etiqueta, 'es'));
}

export interface FiltrosActivos {
  tipo: string;
  nivel: string;
  horario: string;
  instructor: string;
  dias: readonly number[];
}

export const SIN_FILTROS: FiltrosActivos = { tipo: '', nivel: '', horario: '', instructor: '', dias: [] };

/**
 * Cuántos filtros hay puestos. Los días cuentan como UNO por muchos que se
 * marquen: son un solo criterio, y contarlos por separado haría que «lunes y
 * martes» pareciera el doble de restrictivo que «lunes».
 */
export function cuantosFiltros(f: FiltrosActivos): number {
  return [f.tipo, f.nivel, f.horario, f.instructor].filter(Boolean).length + (f.dias.length > 0 ? 1 : 0);
}

/**
 * ¿Merece la pena ofrecer este filtro?
 *
 * Con una sola opción no filtra nada —todas las clases la cumplen— y con
 * ninguna, menos. Un desplegable inerte ocupa sitio y hace dudar de si está
 * roto. Solo se pinta si de verdad puede partir el horario en dos.
 */
export function vaLaPena(opciones: readonly OpcionFiltro[]): boolean {
  return opciones.length >= 2;
}
