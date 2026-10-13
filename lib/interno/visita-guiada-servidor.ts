// ─────────────────────────────────────────────────────────────────────────────
// Las escrituras de /interno → Visita guiada, separadas del endpoint para poder probar QUÉ filtros
// aplican (un «activar en todos» mal filtrado activaría la visita en estudios de verdad, y eso no
// se puede ensayar en producción). SERVER-ONLY: recibe el cliente de service-role.
// ─────────────────────────────────────────────────────────────────────────────

import type { AccionVisita } from './visita-guiada.ts';

/** Lo mínimo del cliente de Supabase que usan estas funciones (así se prueba con uno de pega). */
export interface TablaEscribible {
  update(valores: Record<string, unknown>): FiltroEscribible;
}
export interface FiltroEscribible extends PromiseLike<{ error: unknown }> {
  eq(columna: string, valor: unknown): FiltroEscribible;
  is(columna: string, valor: null): FiltroEscribible;
  select(columnas: string): PromiseLike<{ data: Array<{ id: string }> | null; error: unknown }>;
}
export interface BaseEscribible { from(tabla: 'studios'): TablaEscribible }

/**
 * Activar o desactivar en TODOS. Nunca una demo.
 *  · activar: solo a quien no la tiene y aún no la ha completado (quien ya la hizo no la repite por
 *    un clic masivo; para eso está «activar desde cero», estudio a estudio);
 *  · desactivar: solo a quien la tiene.
 * Devuelve los ids que cambiaron.
 */
export async function aplicarATodos(db: BaseEscribible, activar: boolean): Promise<{ ids: string[]; error: unknown }> {
  let q = db.from('studios').update({ tour_obligatorio: activar }).eq('es_demo', false);
  q = activar ? q.is('tour_completado_en', null).eq('tour_obligatorio', false) : q.eq('tour_obligatorio', true);
  const { data, error } = await q.select('id');
  return { ids: (data ?? []).map(d => d.id), error };
}

/** Los cambios de un estudio por operación. «Activar» conserva el avance; «desde cero» lo reinicia. */
export function cambiosDeEstudio(operacion: Extract<AccionVisita, { accion: 'estudio' }>['operacion']): Record<string, unknown> {
  if (operacion === 'desactivar') return { tour_obligatorio: false };
  if (operacion === 'activar') return { tour_obligatorio: true, tour_completado_en: null };
  return { tour_obligatorio: true, tour_completado_en: null, tour_progreso: {} };
}
