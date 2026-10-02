// Variación porcentual entre dos periodos. La usa el resumen semanal del Decision
// OS (lib/decision/resumen-semanal-cron.ts).
//
// Aquí vivía también el desglose «Ventas por tipo» de /informes sobre la RPC
// `ventas_por_tipo`; desde el rediseño del 2-oct-2026 ese desglose es por MOTIVO
// del cobro y se calcula en lib/informes/motivo-cobro.ts + dinero.ts.

// Sin datos previos (anterior === 0) no hay base para un porcentaje con
// sentido — devuelve null en vez de +Infinity/100%, y el llamador decide cómo
// mostrarlo ("sin datos previos").
export function calcularVariacionPct(actual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  return Math.round(((actual - anterior) / anterior) * 100);
}
