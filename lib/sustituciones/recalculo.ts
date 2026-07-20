import type { RankingItem } from '@/lib/sustituciones/contacto';

// Volver a buscar candidatas para una baja que ya existe.
//
// El ranking se calcula UNA VEZ al crear la baja y se congela en la columna
// `sustituciones.ranking`. Eso deja un callejón sin salida muy real: la
// propietaria ve "ninguna candidata", descubre (por el aviso del panel) que su
// equipo no tenía la disponibilidad cargada, se la pide, sus instructoras la
// rellenan… y la baja abierta sigue diciendo "ninguna candidata" para siempre,
// porque nadie recalcula nada. Este módulo es la parte pura de arreglarlo.

/** Estados desde los que tiene sentido recalcular. */
export const ESTADOS_RECALCULABLES = ['buscando', 'pendiente_aprobacion', 'agotada'] as const;

export type MotivoBloqueo = 'contactando' | 'resuelta';

/**
 * ¿Se puede recalcular ahora? Se bloquea a propósito mientras hay un contacto
 * en vuelo ('contactando'): cambiar el ranking bajo los pies del escalado haría
 * que la instancia de Inngest se viera a sí misma obsoleta y se apagara sola
 * (`escalacionVigente` compara ranking[candidata_actual] con quien persigue), y
 * la candidata que ya tiene el email en la mano se quedaría sin nadie
 * escuchando su respuesta.
 */
export function puedeRecalcular(
  estado: string,
  hayCandidataEnVuelo = true,
): { ok: true } | { ok: false; motivo: MotivoBloqueo } {
  // En modo autónomo una baja puede quedarse en 'contactando' con el ranking
  // VACÍO (no había nadie contactable). Ahí no hay ningún email esperando
  // respuesta, así que bloquear no protege nada y deja la baja en un callejón
  // sin salida: justo el caso en que más falta hace volver a buscar.
  if (estado === 'contactando') {
    return hayCandidataEnVuelo ? { ok: false, motivo: 'contactando' } : { ok: true };
  }
  if (!(ESTADOS_RECALCULABLES as readonly string[]).includes(estado)) {
    return { ok: false, motivo: 'resuelta' };
  }
  return { ok: true };
}

/**
 * Quita del ranking nuevo a quien YA dijo que no puede para esta misma clase.
 * Volver a escribirle es la forma más rápida de que una instructora empiece a
 * ignorar los avisos del sistema — y ya nos contestó, la respuesta no ha
 * cambiado porque hayamos recalculado.
 */
export function filtrarYaRechazadas(ranking: RankingItem[], idsRechazadas: string[]): RankingItem[] {
  if (idsRechazadas.length === 0) return ranking;
  const fuera = new Set(idsRechazadas);
  return ranking.filter((c) => !fuera.has(c.instructor_id));
}

/**
 * Estado en el que queda la sustitución tras recalcular.
 *
 * Si estaba 'agotada' (se avisó a todas y ninguna confirmó) y ahora SÍ hay
 * opciones nuevas, vuelve a manos de la propietaria en vez de reanudar el
 * contacto automático: el mundo ha cambiado desde que se agotó y la decisión de
 * volver a molestar a la gente es suya. Si sigue sin haber nadie, se queda como
 * estaba — fingir progreso sería peor que no hacer nada.
 */
export function estadoTrasRecalcular(estadoActual: string, candidatas: number): string {
  if (estadoActual === 'agotada' && candidatas > 0) return 'pendiente_aprobacion';
  return estadoActual;
}

/** Resumen para el aviso del panel: qué contarle a la propietaria tras recalcular. */
export function resumenRecalculo(antes: number, despues: number): string {
  if (despues === 0) {
    return 'Sigue sin haber ninguna candidata disponible para esta franja.';
  }
  if (despues > antes) {
    const nuevas = despues - antes;
    return nuevas === 1
      ? 'Hay 1 candidata nueva.'
      : `Hay ${nuevas} candidatas nuevas.`;
  }
  return despues === 1 ? 'Sigue habiendo 1 candidata.' : `Siguen siendo ${despues} candidatas.`;
}
