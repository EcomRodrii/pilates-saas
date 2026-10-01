// «De 12 pruebas en septiembre, 5 compraron»: cuántas de las que hicieron su
// prueba un mes acabaron comprando algo de verdad.
//
// · La prueba de cada clienta es su PRIMERA suscripción de un plan `es_prueba`;
//   cuenta en el mes en que se le dio.
// · «Compró» = tiene alguna suscripción que no es de prueba, empezada el mismo
//   día de la prueba o después (lo de antes de la prueba no es haberla
//   convertido: es una veterana a la que se le regaló una).
// · Solo se devuelven los meses con al menos `minimo` pruebas: con menos, una
//   proporción no dice nada (mismo criterio que `MUESTRA_MINIMA` del Brain).
//
// Puro: se prueba con `node --test`.
import type { PlanTarifa, Suscripcion } from '../types.ts';

export interface ConversionMes {
  /** 'YYYY-MM'. */
  mes: string;
  /** 0 = enero. */
  mesIndice: number;
  pruebas: number;
  compraron: number;
}

export const MINIMO_PRUEBAS_PARA_CONTAR = 5;

/** Los dos meses más recientes (este incluido) con suficientes pruebas, del más reciente al más antiguo. */
export function conversionDePruebas(
  suscripciones: readonly Pick<Suscripcion, 'socioId' | 'planId' | 'fechaInicio'>[],
  planes: readonly Pick<PlanTarifa, 'id' | 'esPrueba'>[],
  hoyISO: string,
  minimo = MINIMO_PRUEBAS_PARA_CONTAR,
): ConversionMes[] {
  const esPrueba = new Set(planes.filter(p => p.esPrueba === true).map(p => p.id));
  const pruebaDe = new Map<string, string>();
  const comprasDe = new Map<string, string[]>();
  for (const s of suscripciones) {
    const dia = s.fechaInicio?.slice(0, 10);
    if (!dia) continue;
    if (esPrueba.has(s.planId)) {
      const previa = pruebaDe.get(s.socioId);
      if (!previa || dia < previa) pruebaDe.set(s.socioId, dia);
    } else {
      const lista = comprasDe.get(s.socioId) ?? [];
      lista.push(dia);
      comprasDe.set(s.socioId, lista);
    }
  }

  const porMes = new Map<string, { pruebas: number; compraron: number }>();
  for (const [socio, dia] of pruebaDe) {
    const mes = dia.slice(0, 7);
    const m = porMes.get(mes) ?? { pruebas: 0, compraron: 0 };
    m.pruebas++;
    if ((comprasDe.get(socio) ?? []).some(c => c >= dia)) m.compraron++;
    porMes.set(mes, m);
  }

  // Este mes y los dos anteriores; se quedan los dos más recientes que llegan al mínimo.
  const [a, m] = [Number(hoyISO.slice(0, 4)), Number(hoyISO.slice(5, 7))];
  const meses = [0, 1, 2].map(k => {
    const d = new Date(Date.UTC(a, m - 1 - k, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
  return meses
    .map(mes => ({ mes, ...(porMes.get(mes) ?? { pruebas: 0, compraron: 0 }) }))
    .filter(x => x.pruebas >= minimo)
    .slice(0, 2)
    .map(x => ({ ...x, mesIndice: Number(x.mes.slice(5, 7)) - 1 }));
}
