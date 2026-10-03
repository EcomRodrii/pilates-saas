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
      /** Reservas nuevas que ha creado el motor al guardar (hasta 180 días por delante). */
      creadas: number;
      /** Fecha (YYYY-MM-DD) de la próxima clase de la plaza si ya la tiene reservada. */
      primeraFecha: string | null;
      /** Hay al menos una clase programada en ese horario. */
      hayClaseProgramada: boolean;
      /** Al mover: reservas del horario anterior que se han cancelado. */
      canceladas: string[];
    }
  | { ok: false; error: string; codigo?: 'SUPERA_LIMITE' | 'SIN_CUPO'; limite?: number };

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

/** Cómo decide el estudio las plazas fijas sueltas que pide la alumna (`studios.plaza_fija_aprobacion`). */
export type AprobacionPlazaFija = 'MANUAL' | 'AUTOMATICA';

/** El tope de plazas fijas que puede ocupar una clase antes de que las nuevas pasen al estudio: un porcentaje del aforo. */
export const TOPES_AUTOMATICOS_PCT = [25, 50, 75, 100] as const;
export const TOPE_AUTOMATICO_POR_DEFECTO_PCT = 50;

/**
 * Cuántas plazas fijas caben en una clase de `aforo` plazas con aprobación automática al `pct` %. Se redondea HACIA ABAJO a
 * propósito: con aforo 3 al 50 % el tope es 1, no 2 —el estudio puso un límite y nunca se pasa de él—, y una clase de una sola
 * plaza al 50 % no admite ninguna automática (decide el estudio). Un aforo o porcentaje que no es un número da 0: sin dato, no se
 * aprueba solo.
 */
export function cupoAutomatico(aforo: number | null | undefined, pct: number | null | undefined): number {
  if (typeof aforo !== 'number' || typeof pct !== 'number' || !Number.isFinite(aforo) || !Number.isFinite(pct)) return 0;
  if (aforo <= 0 || pct <= 0) return 0;
  return Math.floor(Math.min(aforo, (aforo * Math.min(pct, 100)) / 100));
}

/**
 * Por qué una petición suelta NO se aprueba sola, o `null` si pasa las reglas que se pueden mirar ANTES de escribir. Una sola
 * función para que el servidor decida y las pruebas fijen el orden: cada motivo es una regla que el estudio ya tiene, no una
 * nueva. El cupo (cuántas plazas fijas caben) NO está aquí: se cuenta DENTRO del candado de la base al dar la plaza
 * (`dar_plaza_fija_con_cupo`), porque contarlo antes y escribir después deja pasar a dos a la vez.
 */
export type MotivoNoAutomatica = 'MANUAL' | 'SUPERA_LIMITE' | 'RESERVA_CON_APROBACION' | 'IMPAGO';

export function motivoNoAutomatica(c: {
  modo: AprobacionPlazaFija;
  superaLimite: boolean;
  /** La clase exige aprobar cada reserva (estudio o tipo de clase): una plaza fija las reservaría todas sin pasar por ahí. */
  reservaConAprobacion: boolean;
  /** Impago que bloquea reservar (ajuste del estudio y deuda de la alumna). */
  impagoBloqueante: boolean;
}): MotivoNoAutomatica | null {
  if (c.modo !== 'AUTOMATICA') return 'MANUAL';
  // Pasar del límite semanal de su cuota NUNCA se aprueba solo (decisión del fundador, 16-sep).
  if (c.superaLimite) return 'SUPERA_LIMITE';
  if (c.reservaConAprobacion) return 'RESERVA_CON_APROBACION';
  if (c.impagoBloqueante) return 'IMPAGO';
  return null;
}
