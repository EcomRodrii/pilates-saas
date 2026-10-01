// Ventas del TPV cobradas que NO tienen recibo, y por eso no cuentan en ninguna
// cifra de ingresos.
//
// Las cifras de dinero (Inicio, Cobros, Informes) cuentan RECIBOS. Desde el TPV
// de servidor (#1718) cada venta pagada crea su recibo `rec-pos-*` y se enlaza
// con `ventas_pos.recibo_id`; si ese insert falla, la venta queda cobrada y sin
// recibo (venta-servidor.ts avisa a Sentry). Y hay ventas de la primera versión
// del TPV (junio-julio de 2026) que nunca tuvieron recibo: 7 en producción,
// 667,50 €, sin nada con lo que enlazarlas (F0, 1-oct-2026).
//
// No se les inventa un recibo: crearlo sería escribir un apunte que nadie hizo.
// Se cuentan aparte y se enseñan, para que la propietaria sepa que existen,
// cuánto suman y que NO están en sus ingresos, y pueda investigar de dónde salen.

export interface VentaParaRecibo {
  estado?: string | null;
  reciboId?: string | null;
  total: number | string;
  realizadaEn?: string | null;
}

export function esVentaSinRecibo(v: VentaParaRecibo): boolean {
  return v.estado === 'PAGADA' && !v.reciboId && Number(v.total) > 0;
}

export interface ResumenVentasSinRecibo { n: number; total: number }

export function resumenVentasSinRecibo(ventas: readonly VentaParaRecibo[]): ResumenVentasSinRecibo {
  let n = 0, total = 0;
  for (const v of ventas) {
    if (!esVentaSinRecibo(v)) continue;
    n++;
    total += Number(v.total);
  }
  return { n, total: Math.round(total * 100) / 100 };
}
