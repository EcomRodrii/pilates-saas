// ─────────────────────────────────────────────────────────────────────────────
// «Cobrar varias a la vez» (Cobros): qué recibos entran.
//
// Antes entraban solo los PENDIENTE de clientas con un plan ACTIVO: se quedaban
// fuera justo los que más cuesta cobrar —lo rechazado (FALLIDO), lo devuelto por
// el banco, la clase suelta, la matrícula y la cuota cancelada con deuda— y
// entraban los que el cobro automático ya tenía programados (se cobraban a mano
// y además se reintentaban solos).
//
// Ahora: todo lo que la clienta DEBE (`situacionRecibo`: por cobrar o impagado),
// menos lo que está en el banco (EN_CURSO: aún no ha contestado) y lo que tiene
// un reintento automático programado. Puro, sin `@/`: lo prueba `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

import { situacionRecibo, type ReciboParaCifras } from '../billing/situacion-recibo.ts';

export function entraEnCobroEnLote(r: ReciboParaCifras & { socioId?: string | null; proximoReintento?: string | null }): boolean {
  // Sin clienta (una venta de mostrador anónima) no hay a quién cobrárselo.
  if (!r.socioId) return false;
  const s = situacionRecibo(r);
  if (s !== 'POR_COBRAR' && s !== 'IMPAGADO') return false;
  return !r.proximoReintento;
}
