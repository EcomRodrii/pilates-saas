// Lo que dice cada tarjeta de plan en /reservar y en los widgets «Planes y
// precios» / «Bonos y packs»: puro, sin React, para poder probarlo.
//
// Las dos líneas que deciden una compra y que antes no se decían juntas:
// cuánto sale cada clase y hasta cuándo vale. Nada de esto se inventa: si el
// plan no tiene sesiones no hay «por clase», y si no caduca se dice.

import type { PlanTarifa } from '../types.ts';
import { nombrePeriodo } from '../bono-logic.ts';

export type TipoTarjetaPlan = 'cuota' | 'bono' | 'suelta';

export interface ResumenPlan {
  tipo: TipoTarjetaPlan;
  /** «16 € / clase», o null si no hay sesiones con las que dividir. */
  porClase: string | null;
  /** «2 meses», «30 días», «Sin caducidad» o «Cada mes · sin compromiso». */
  vigencia: string;
  /** «/mes» detrás del precio de una cuota; vacío en bonos y sueltas. */
  sufijoPrecio: string;
}

const euros = (n: number) =>
  `${n.toLocaleString('es-ES', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })} €`;

export function precioEnEuros(n: number): string {
  return euros(n);
}

function vigenciaDeDias(dias: number | null | undefined): string {
  if (!dias || dias <= 0) return 'Sin caducidad';
  if (dias % 30 === 0) {
    const meses = dias / 30;
    return meses === 1 ? '1 mes' : `${meses} meses`;
  }
  if (dias % 7 === 0) {
    const semanas = dias / 7;
    return semanas === 1 ? '1 semana' : `${semanas} semanas`;
  }
  return dias === 1 ? '1 día' : `${dias} días`;
}

type Plan = Pick<PlanTarifa, 'tipo' | 'precio' | 'sesiones' | 'validezDias' | 'periodicidadMeses'>;

export function resumenPlan(p: Plan): ResumenPlan {
  if (p.tipo === 'MENSUAL') {
    return { tipo: 'cuota', porClase: null, vigencia: `Cada ${nombrePeriodo(p)} · sin compromiso`, sufijoPrecio: `/${nombrePeriodo(p)}` };
  }
  const porClase = p.sesiones && p.sesiones > 1 && p.precio > 0 ? `${euros(p.precio / p.sesiones)} / clase` : null;
  const tipo: TipoTarjetaPlan = p.tipo === 'PUNTUAL' && (p.sesiones ?? 1) <= 1 ? 'suelta' : 'bono';
  // La suelta dice qué es («1 clase») antes de su caducidad, como en la
  // referencia; sin eso «Clase suelta · Sin caducidad» parecía un bono raro.
  const vigencia = tipo === 'suelta' ? `1 clase · ${vigenciaDeDias(p.validezDias)}` : vigenciaDeDias(p.validezDias);
  return { tipo, porClase, vigencia, sufijoPrecio: '' };
}

/**
 * Cómo se enseñan los planes. «lista» (referencia «Pases y bonos») cuando el
 * widget vende UN solo tipo, que es lo que pide «Bonos y packs»; «columnas»
 * (referencia «Tarifas») cuando se comparan tipos distintos.
 */
export function maquetaPlanes(tipos: readonly string[]): 'lista' | 'columnas' {
  return tipos.length === 1 ? 'lista' : 'columnas';
}
