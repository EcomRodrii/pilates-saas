// ─────────────────────────────────────────────────────────────────────────────
// Pagos históricos importados de la plataforma anterior, en las cifras.
//
// Un estudio que migra importa sus pagos (`pagos_historicos`), y Cobros e
// Informes seguían en 0 € para los meses anteriores: el comparativo «frente a
// septiembre» se quedaba vacío y la propietaria no veía por ninguna parte lo
// que ya había cobrado. Se encontró migrando 568 pagos de prueba y viendo
// «Cobrado en octubre 65,00 €».
//
// REGLA (docs/cifras-financieras.md): un recibo se lee con `situacion-recibo`, y
// esto NO es un recibo — `pagos_historicos` es una tabla aparte a propósito: sin
// factura, sin NIF verificado, sin Stripe, ya declarado por la gestoría anterior.
// Por eso NO se suma al «Cobrado» (que cuadra con el cierre y la gestoría): se
// enseña AL LADO, con su propia cifra, la de su periodo y la del anterior, y se
// dice qué es. Así cuenta para la propietaria sin inventar un ingreso fiscal.
//
// Puro: se prueba con `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

import { aCentimos } from '../billing/situacion-recibo.ts';
import type { Tramo } from './lo-cobrado.ts';

/** Lo importado un día: ya agregado en servidor para no mandar miles de filas. */
export interface PagosHistoricosDelDia { fecha: string; n: number; total: number }

export interface ResumenPagosHistoricos { n: number; total: number }

/** Lo importado dentro de un tramo ('YYYY-MM-DD' del estudio, ambos extremos incluidos). */
export function pagosHistoricosEnTramo(dias: readonly PagosHistoricosDelDia[], t: Tramo): ResumenPagosHistoricos {
  let n = 0, total = 0;
  for (const d of dias) {
    if (d.fecha < t.desde || d.fecha > t.hasta) continue;
    n += d.n;
    total = aCentimos(total + d.total);
  }
  return { n, total };
}

/** Agrega filas sueltas (fecha + importe) por día: lo que hace el servidor antes de responder. */
export function agruparPorDia(filas: readonly { fecha: string; importe: number | string }[]): PagosHistoricosDelDia[] {
  const porDia = new Map<string, PagosHistoricosDelDia>();
  for (const f of filas) {
    const fecha = String(f.fecha).slice(0, 10);
    const d = porDia.get(fecha) ?? { fecha, n: 0, total: 0 };
    d.n++;
    d.total = aCentimos(d.total + Number(f.importe));
    porDia.set(fecha, d);
  }
  return [...porDia.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
}
