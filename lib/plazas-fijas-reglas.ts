// Reglas para dar o mover una plaza fija, compartidas por el servidor (que las
// aplica) y el panel (que las explica). Lógica pura, sin fechas del sistema: el
// «hoy» entra por parámetro.
//
// ⚠️ SOLO CON CUOTA (decisión del fundador, 15-sep-2026). Las reservas que crea
// una plaza fija no descuentan sesiones de ningún bono (`res-pf-`), así que con
// un bono serían clases gratis mientras siguiera activo. La plaza fija es de
// quien paga una cuota —plan MENSUAL, que cubre también trimestral y anual vía
// `periodicidadMeses`— vigente y que incluya la clase. Con bono, se reserva
// clase a clase. El motor (`materializar_plazas_fijas`) aplica el mismo
// criterio cada noche; si uno cambia, cambia el otro.

import { planCubreTipoClase } from './bono-logic.ts';
import type { PlanTarifa, PlazaFija, Suscripcion } from './types.ts';

/** Lo que el panel (o la app) manda para crear o mover una plaza fija. La hora,
 *  el día, la sala y el tipo NO viajan: se deducen en el servidor de la clase. */
export interface DatosPlazaFija {
  socioId: string;
  /** Una clase concreta del horario: su franja semanal es la plaza. */
  sesionId: string;
  spotId: string | null;
  vigenciaDesde: string;          // YYYY-MM-DD
  vigenciaHasta: string | null;   // YYYY-MM-DD, null = sin fin
  /** Asignar aunque supere el límite semanal de su cuota (se avisa antes). */
  confirmarLimite?: boolean;
}

export type ResultadoGuardarPlazaFija =
  | {
      ok: true;
      plaza: PlazaFija;
      /** Reservas nuevas que ha creado el motor al guardar (próximas 6 semanas). */
      creadas: number;
      /** Fecha (YYYY-MM-DD) de la próxima clase de la plaza si ya la tiene reservada. */
      primeraFecha: string | null;
      /** Hay al menos una clase programada en ese horario. */
      hayClaseProgramada: boolean;
      /** Al mover: reservas del horario anterior que se han cancelado. */
      canceladas: string[];
    }
  | { ok: false; error: string; codigo?: 'SUPERA_LIMITE'; limite?: number };

/**
 * La cuota que le da derecho a una plaza fija en esta clase, o `null`.
 * Con varias, la más holgada (sin límite semanal gana a cualquier límite): es
 * la que decide si una plaza más cabe.
 */
export function cuotaParaPlazaFija(
  socioId: string,
  suscripciones: Suscripcion[],
  planes: PlanTarifa[],
  hoyISO: string,
  tipoClaseId: string | null,
): PlanTarifa | null {
  let mejor: PlanTarifa | null = null;
  for (const s of suscripciones) {
    if (s.socioId !== socioId || s.estado !== 'ACTIVA') continue;
    if (s.fechaFin && s.fechaFin < hoyISO) continue;
    const plan = planes.find(p => p.id === s.planId);
    if (!plan || plan.tipo !== 'MENSUAL' || !planCubreTipoClase(plan, tipoClaseId)) continue;
    if (!mejor || holgura(plan) > holgura(mejor)) mejor = plan;
  }
  return mejor;
}

function holgura(plan: PlanTarifa): number {
  const limite = plan.limiteSemanal ?? 0;
  return limite > 0 ? limite : Number.POSITIVE_INFINITY;
}

/**
 * Si una plaza fija más le haría pasar del límite semanal de su cuota. No
 * bloquea (decisión del fundador): el panel avisa y deja confirmar, porque hay
 * acuerdos pactados a mano. `plazasActivas` = las que ya tiene, sin contar la
 * que se está moviendo.
 */
export function superaLimiteSemanal(cuota: PlanTarifa, plazasActivas: number): { limite: number } | null {
  const limite = cuota.limiteSemanal ?? 0;
  if (limite <= 0) return null;
  return plazasActivas + 1 > limite ? { limite } : null;
}
