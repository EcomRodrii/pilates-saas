import type { EtiquetaCambio } from '@/lib/interno/client';

// La lógica de la sección «Actualizaciones», pura y sin React.
//
// ⚠️ El dato NO es «una actualización con título, descripción y preview»: es una
// VERSIÓN con una lista de cambios de una línea (`changelog_versiones` +
// `changelog_cambios`, migr 20260803203046), que se publica desde /interno. Todo
// lo que la pantalla enseña se deriva de ahí — no hay ningún changelog escrito a
// mano en el código, y no debe haberlo: se publica sin desplegar.
//
// Aquí vive lo que decide QUÉ se ve, separado del cómo se pinta, porque es lo
// único de esta sección que puede estar mal de una forma que no se ve mirando.

export type FiltroActualizaciones = 'todas' | 'nuevas' | 'mejoras' | 'correcciones';

export interface CambioVersion {
  etiqueta: EtiquetaCambio;
  texto: string;
  orden?: number;
}

export interface VersionPublicada {
  id: string;
  version: string;
  titulo: string;
  fecha_publicacion: string;
  cambios: CambioVersion[];
}

/**
 * Las cuatro etiquetas del dato repartidas en los tres filtros de la pantalla.
 *
 * `RENDIMIENTO` cae en «Mejoras» a propósito: para quien lleva un estudio, «va
 * más rápido» es una mejora, no una categoría aparte. Distinguirlas en el filtro
 * obligaría a explicar una diferencia que solo le importa a quien programa.
 */
const FILTRO_DE_ETIQUETA: Record<EtiquetaCambio, Exclude<FiltroActualizaciones, 'todas'>> = {
  NUEVA_FUNCIONALIDAD: 'nuevas',
  MEJORA: 'mejoras',
  RENDIMIENTO: 'mejoras',
  ARREGLO: 'correcciones',
};

export function filtroDeEtiqueta(e: EtiquetaCambio): Exclude<FiltroActualizaciones, 'todas'> {
  return FILTRO_DE_ETIQUETA[e];
}

/**
 * De qué va una versión, en una palabra: lo que manda su cambio más «alto».
 *
 * Una versión mezcla casi siempre las cuatro etiquetas (en producción, 8 de 11
 * traen ARREGLO y NUEVA_FUNCIONALIDAD a la vez), así que hace falta un criterio.
 * Gana lo que es NUEVO: es lo que hace entrar a mirar. Si no hay nada nuevo,
 * manda la mejora; y si solo hay arreglos, se dice que son arreglos — una
 * versión de correcciones anunciada como «novedad» es una promesa vacía.
 */
export function categoriaDeVersion(cambios: readonly CambioVersion[]): Exclude<FiltroActualizaciones, 'todas'> {
  if (cambios.some((c) => c.etiqueta === 'NUEVA_FUNCIONALIDAD')) return 'nuevas';
  if (cambios.some((c) => c.etiqueta === 'MEJORA' || c.etiqueta === 'RENDIMIENTO')) return 'mejoras';
  return 'correcciones';
}

/** Cuántos cambios de cada tipo trae una versión, para el resumen de la tarjeta. */
export function recuentoPorFiltro(cambios: readonly CambioVersion[]): Record<Exclude<FiltroActualizaciones, 'todas'>, number> {
  const r = { nuevas: 0, mejoras: 0, correcciones: 0 };
  for (const c of cambios) r[filtroDeEtiqueta(c.etiqueta)] += 1;
  return r;
}

/**
 * Las versiones que quedan al aplicar un filtro, con sus cambios ya recortados.
 *
 * ⚠️ Recorta los CAMBIOS además de las versiones: si al filtrar «Correcciones»
 * una versión siguiera enseñando sus funciones nuevas, el filtro no estaría
 * filtrando nada — solo escondiendo versiones enteras. Una versión sin ningún
 * cambio del tipo pedido desaparece.
 */
export function aplicarFiltro(
  versiones: readonly VersionPublicada[],
  filtro: FiltroActualizaciones,
): VersionPublicada[] {
  if (filtro === 'todas') return [...versiones];
  return versiones
    .map((v) => ({ ...v, cambios: v.cambios.filter((c) => filtroDeEtiqueta(c.etiqueta) === filtro) }))
    .filter((v) => v.cambios.length > 0);
}

/**
 * ¿Es reciente? Lo que se marca con «Nueva» en la lista.
 *
 * 14 días y no 7: Tentare publica casi cada semana, así que con una semana el
 * distintivo lo llevaría siempre la primera y no distinguiría nada. Con dos, hay
 * semanas en que lo llevan dos versiones y semanas en que no lo lleva ninguna —
 * que es justo lo que hace que signifique algo.
 */
export const DIAS_RECIENTE = 14;

export function esReciente(fechaISO: string, ahoraMs: number | null): boolean {
  if (ahoraMs === null) return false;
  const t = new Date(`${fechaISO}T00:00:00`).getTime();
  if (!Number.isFinite(t)) return false;
  if (ahoraMs < t) return false; // publicada en el futuro: aún no es nada
  // ⚠️ Se cuentan DÍAS ENTEROS, no la diferencia exacta de instantes. Con
  // instantes, una versión publicada hace justo 14 días dejaba de ser reciente
  // a mediodía —cuando la fecha guardada es medianoche— y el distintivo se
  // apagaba a media jornada sin que hubiera pasado nada. Un changelog se lee
  // por fechas, no por horas.
  return Math.floor((ahoraMs - t) / 86_400_000) <= DIAS_RECIENTE;
}
