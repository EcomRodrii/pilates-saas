// ─────────────────────────────────────────────────────────────────────────────
// Las formas de venir a UNA clase pagando online, y cuánto cuesta cada una
// (P01/P06 · bloque de dinero de la app de la alumna, 6-oct-2026).
//
// UNA regla para tres sitios: la ficha de la clase (qué opciones enseña), la
// ruta de cobro `checkout-embebido` con clase (qué importe cobra) y
// `opciones-clase` (lo que el servidor le dice a la app). Si los tres no salen
// de aquí, la pantalla promete un precio y el cobro hace otro — que es el bug
// que tenía la clase suelta: el mostrador cobraba `importeDeClaseSuelta`, el
// checkout `plan.precio` y la app `precioDeSesion`, tres reglas distintas.
//
// Fase A (decisión del fundador): se vende online la clase suelta AL PRECIO DE
// SU TARIFA y los bonos que cubren la clase. Una clase con precio propio (un
// taller, `sesiones.precio_puntual` distinto de la tarifa) NO se vende online:
// se reserva en el estudio. Una cuota (MENSUAL) tampoco sale aquí: no es «venir
// a esta clase», es otra decisión, y vive en la tienda. La clase de prueba
// llega con P07.
//
// Puro y sin `@/` (lo prueba `node --test`).
// ─────────────────────────────────────────────────────────────────────────────

import type { PlanTarifa } from '../types.ts';
import { planCubreTipoClase } from '../bono-logic.ts';
import { planDeClaseSuelta } from '../reservas/clase-suelta.ts';
import { ahorroPorcentaje } from './ahorro-plan.ts';

/** Lo mínimo que Stripe deja cobrar en euros. Por debajo, el cobro falla en Stripe: no se ofrece. */
export const IMPORTE_MINIMO_EUR = 0.5;

export interface OpcionDeClase {
  /** `prueba`: la clase de prueba de quien nunca ha venido (P07). Solo la añade el servidor (`opciones-clase`). */
  tipo: 'suelta' | 'bono' | 'prueba';
  planId: string;
  nombre: string;
  /** Lo que cuesta el plan (sin código ni matrícula: eso lo suma el servidor al cobrar). */
  importe: number;
  /** Clases que trae. La suelta, 1. */
  sesiones: number;
  /** Importe / sesiones, a dos decimales. */
  precioPorClase: number;
  /** Frente a la suelta de esta clase; solo si se ahorra de verdad (`ahorroPorcentaje`). */
  ahorroPct?: number;
  /** Días que vale desde la compra; `null` = sin caducidad. */
  validezDias: number | null;
  /** Las que le quedan después de gastar una en esta clase. */
  quedanTrasEsta: number;
  /** Por debajo del mínimo de Stripe: se enseña, pero no se puede pagar online. */
  noPagable?: boolean;
  /** Solo la prueba: a 0 € no se paga, se reserva con `pruebaPlanId` («Reservar gratis»). */
  gratis?: boolean;
}

/**
 * La clase de prueba como una opción más, la PRIMERA (P07). Solo para quien el servidor considera nueva
 * (`pruebaParaSocia`) y si cubre el tipo de la clase: eso lo decide quien llama.
 */
export function opcionDePrueba(o: { planId: string; nombre: string; precio: number; gratis: boolean }): OpcionDeClase {
  const importe = redondear(Number(o.precio));
  return {
    tipo: 'prueba', planId: o.planId, nombre: o.nombre, importe, sesiones: 1, precioPorClase: importe,
    validezDias: null, quedanTrasEsta: 0,
    ...(o.gratis ? { gratis: true } : importe < IMPORTE_MINIMO_EUR ? { noPagable: true } : {}),
  };
}

export interface OpcionesDeClase {
  opciones: OpcionDeClase[];
  /** La sesión tiene precio propio distinto del de la tarifa: en Fase A no se vende online. */
  precioEspecial: boolean;
}

type PlanMin = Pick<PlanTarifa, 'id' | 'nombre' | 'tipo' | 'precio' | 'activo' | 'sesiones' | 'tiposClaseIds' | 'esPrueba' | 'validezDias'>;

function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}

/** ¿La sesión trae un precio propio que no es el de su tarifa de clase suelta? */
export function tienePrecioEspecial(precioPuntualSesion: number | null | undefined, suelta: Pick<PlanTarifa, 'precio'> | null): boolean {
  if (typeof precioPuntualSesion !== 'number' || !Number.isFinite(precioPuntualSesion)) return false;
  // Una sesión gratuita (0) no se vende: no es «precio especial», es que no se cobra.
  if (precioPuntualSesion <= 0) return false;
  return !suelta || redondear(precioPuntualSesion) !== redondear(Number(suelta.precio));
}

/**
 * Las opciones para venir a esta clase pagando online: la suelta (si hay
 * tarifa que la cubra) y los bonos que la cubren, de más barato a más caro.
 * Vacío con `precioEspecial`: esa clase se reserva en el estudio.
 */
export function opcionesDeClase({ planes, tipoClaseId, precioPuntualSesion }: {
  planes: readonly PlanMin[] | null | undefined;
  tipoClaseId: string | null;
  precioPuntualSesion?: number | null;
}): OpcionesDeClase {
  const lista = (planes ?? []) as PlanTarifa[];
  const suelta = planDeClaseSuelta(lista, tipoClaseId);
  if (tienePrecioEspecial(precioPuntualSesion, suelta)) return { opciones: [], precioEspecial: true };

  const precioSuelta = suelta ? Number(suelta.precio) : null;
  const opciones: OpcionDeClase[] = [];
  if (suelta) {
    opciones.push({
      tipo: 'suelta', planId: suelta.id, nombre: suelta.nombre, importe: redondear(Number(suelta.precio)),
      sesiones: 1, precioPorClase: redondear(Number(suelta.precio)), validezDias: suelta.validezDias ?? null, quedanTrasEsta: 0,
    });
  }
  const bonos = lista
    .filter((p) => p.tipo === 'BONO' && p.activo !== false && p.esPrueba !== true)
    .filter((p) => Number(p.precio) > 0 && Number(p.sesiones) > 0)
    .filter((p) => planCubreTipoClase(p, tipoClaseId))
    .sort((a, b) => Number(a.precio) - Number(b.precio) || (a.id < b.id ? -1 : 1));
  for (const b of bonos) {
    const sesiones = Number(b.sesiones);
    const importe = redondear(Number(b.precio));
    const ahorro = ahorroPorcentaje({ precio: importe, sesiones }, precioSuelta);
    opciones.push({
      tipo: 'bono', planId: b.id, nombre: b.nombre, importe, sesiones,
      precioPorClase: redondear(importe / sesiones),
      ...(ahorro ? { ahorroPct: ahorro } : {}),
      validezDias: b.validezDias ?? null,
      quedanTrasEsta: sesiones - 1,
    });
  }
  return {
    opciones: opciones.map((o) => (o.importe < IMPORTE_MINIMO_EUR ? { ...o, noPagable: true } : o)),
    precioEspecial: false,
  };
}

/** Lo más barato que se puede pagar online para venir a esta clase, o `null`. */
export function desdeImporte(opciones: readonly OpcionDeClase[]): number | null {
  const pagables = opciones.filter((o) => !o.noPagable);
  return pagables.length ? Math.min(...pagables.map((o) => o.importe)) : null;
}

export type ImporteACobrar =
  | { ok: true; importe: number }
  | { ok: false; codigo: 'precio-especial' | 'no-cubre'; error: string };

/**
 * Lo que cobra el checkout por un plan comprado PARA una clase concreta, antes
 * de código y matrícula (eso lo suma la ruta como siempre). Mismo criterio que
 * `opcionesDeClase`: si la pantalla no lo ofrece, el cobro no lo acepta.
 */
export function importeACobrar({ plan, tipoClaseId, precioPuntualSesion, planes }: {
  plan: PlanMin;
  tipoClaseId: string | null;
  precioPuntualSesion?: number | null;
  /** Las tarifas del estudio: hacen falta para saber cuál es la suelta de esta clase. */
  planes: readonly PlanMin[];
}): ImporteACobrar {
  const suelta = planDeClaseSuelta(planes as PlanTarifa[], tipoClaseId);
  if (tienePrecioEspecial(precioPuntualSesion, suelta)) {
    return { ok: false, codigo: 'precio-especial', error: 'Esta clase tiene un precio especial: resérvala en el estudio.' };
  }
  if (!planCubreTipoClase(plan, tipoClaseId)) {
    return { ok: false, codigo: 'no-cubre', error: 'Ese plan no sirve para esta clase.' };
  }
  return { ok: true, importe: redondear(Number(plan.precio)) };
}
