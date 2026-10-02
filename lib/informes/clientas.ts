// ─────────────────────────────────────────────────────────────────────────────
// El bloque «Clientas» de Informes (rediseño del 2-oct-2026, decisiones F2/F3).
//
// · «Vinieron»: clientas distintas con alguna clase ASISTIDA en el tramo (las
//   mismas clases que cuenta el bloque Clases: `sesionesDelTramo`). Es el
//   titular, frente al mismo tramo del periodo anterior.
// · «Las que más vienen»: por clases a las que VINIERON (ASISTIDA). Antes contaba
//   también las reservas confirmadas, futuras incluidas: medía quién reserva más,
//   no quién viene más.
// · «Nuevas»: las que empezaron en el tramo, con la MISMA regla que las cohortes
//   (`cuandoEmpezoCadaClienta`, en cohortes.ts): su primera compra de verdad, sin importadas ni
//   veteranas.
//
// Las reservas de plataformas (ClassPass, USC…) no tienen clienta: no cuentan.
//
// Puro: se prueba con `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

import type { Tramo } from '../cobros/lo-cobrado.ts';
import { sesionesDelTramo, type ReservaParaInforme, type SesionParaInforme } from './clases.ts';

export interface ClientaQueViene {
  socioId: string;
  /** Clases a las que vino en el tramo. */
  clases: number;
}

export interface ClientasDelTramo {
  /** Clientas distintas que vinieron a alguna clase. */
  vinieron: number;
  /** Las que más vinieron, de más a menos (hasta `cuantas`). */
  lasQueMasVienen: ClientaQueViene[];
}

export function clientasDelTramo(
  sesiones: readonly SesionParaInforme[], reservas: readonly ReservaParaInforme[], t: Tramo, ahora: Date, cuantas = 5,
): ClientasDelTramo {
  const ids = new Set(sesionesDelTramo(sesiones, t, ahora).map(s => s.id));
  const porClienta = new Map<string, number>();
  for (const r of reservas) {
    if (r.estado !== 'ASISTIDA' || !r.socioId || !ids.has(r.sesionId)) continue;
    porClienta.set(r.socioId, (porClienta.get(r.socioId) ?? 0) + 1);
  }
  const lasQueMasVienen = [...porClienta.entries()]
    .map(([socioId, clases]) => ({ socioId, clases }))
    .sort((a, b) => b.clases - a.clases || a.socioId.localeCompare(b.socioId))
    .slice(0, cuantas);
  return { vinieron: porClienta.size, lasQueMasVienen };
}

/**
 * Cuántas clientas empezaron dentro del tramo. Recibe lo que ya calculó
 * `cuandoEmpezoCadaClienta` (una vez por pantalla, no una por tramo).
 */
export function nuevasEnTramo(empezaron: ReadonlyMap<string, string>, t: Tramo): number {
  let n = 0;
  for (const dia of empezaron.values()) if (dia >= t.desde && dia <= t.hasta) n++;
  return n;
}
