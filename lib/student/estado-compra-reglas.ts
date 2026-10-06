// Después de pagar en la app, ¿ya está el bono? (P01, 6-oct-2026)
//
// Parte PURA del sondeo que hace la hoja de compra contra
// `/api/public/estado-pago` con la sesión de la alumna. Sin imports de servidor
// ni alias `@/`: la comparten la hoja y sus tests.
//
// ⚠️ La regla que gobierna esto es la de siempre en este repo: que Stripe diga
// «cobrado» NO es que el bono esté. Lo entrega el webhook (o el conciliador,
// cada hora), y solo cuando el servidor contesta `compra.entregada` se le dice
// a la alumna «activo». Antes la hoja decía «Ya está en tu cuenta» en cuanto
// `confirmPayment` volvía.

import { RETARDOS_POLL_MS, type CompraEntregada } from '../billing/estado-pago-publico.ts';

export type { CompraEntregada } from '../billing/estado-pago-publico.ts';

/** Lo que dice UNA consulta, ya traducido. */
export type LecturaEstadoCompra =
  | { tipo: 'entregada'; compra: CompraEntregada }
  /** Todavía no (o no se ha podido saber). `esperaMinMs`: lo que pidió el servidor (Retry-After). */
  | { tipo: 'en_proceso'; esperaMinMs?: number }
  /** La sesión caducó: hay que volver a entrar. El pago no se pierde. */
  | { tipo: 'sesion' }
  /** Le falta el segundo paso de la verificación: a esa pantalla, no al login. */
  | { tipo: 'dos-pasos' };

/**
 * Traduce la respuesta HTTP. Todo lo que no sea una de las respuestas buenas
 * cuenta como «en proceso»: un 500, un 429 o un cuerpo raro no son un error del
 * pago (el pago ya está hecho), son que no se sabe todavía.
 */
export function leerEstadoCompra(
  status: number,
  retryAfter: string | null,
  cuerpo: unknown,
): LecturaEstadoCompra {
  const c = (cuerpo && typeof cuerpo === 'object' ? cuerpo : {}) as { compra?: unknown; codigo?: unknown };
  if (status === 401) return c.codigo === 'doble_factor_requerido' ? { tipo: 'dos-pasos' } : { tipo: 'sesion' };
  if (status === 429) {
    const seg = Number(retryAfter);
    return Number.isFinite(seg) && seg > 0 ? { tipo: 'en_proceso', esperaMinMs: Math.min(seg, 60) * 1000 } : { tipo: 'en_proceso' };
  }
  if (status >= 200 && status < 300) {
    const compra = c.compra as Partial<CompraEntregada> | undefined;
    if (compra && compra.entregada === true && typeof compra.plan === 'string') {
      return {
        tipo: 'entregada',
        compra: {
          entregada: true,
          plan: compra.plan,
          sesionesRestantes: typeof compra.sesionesRestantes === 'number' ? compra.sesionesRestantes : null,
          fechaFin: typeof compra.fechaFin === 'string' ? compra.fechaFin : null,
        },
      };
    }
  }
  return { tipo: 'en_proceso' };
}

/**
 * Cuánto esperar antes de la consulta número `intento` (0 = la primera), o
 * `null` si se acabó la espera razonable (~35 s, la cadencia de /reservar).
 * Un Retry-After alarga ESA espera, nunca la acorta, y cuenta como un intento
 * más: así un servidor que contesta siempre 429 no deja la hoja preguntando
 * para siempre.
 */
export function esperaAntesDe(intento: number, esperaMinMs?: number): number | null {
  if (intento < 0 || intento >= RETARDOS_POLL_MS.length) return null;
  const base = RETARDOS_POLL_MS[intento];
  return esperaMinMs && esperaMinMs > base ? esperaMinMs : base;
}

/** «Te quedan 8 clases» / «Clases ilimitadas», con la caducidad si la hay. */
export function resumenDeCompra(c: CompraEntregada, fechaLegible?: (iso: string) => string): string {
  const sesiones = c.sesionesRestantes == null
    ? 'clases ilimitadas'
    : c.sesionesRestantes === 1 ? 'te queda 1 clase' : `te quedan ${c.sesionesRestantes} clases`;
  const hasta = c.fechaFin && fechaLegible ? ` hasta el ${fechaLegible(c.fechaFin)}` : '';
  return `${c.plan} activo · ${sesiones}${hasta}`;
}

// ── RECIBOS (6-oct-2026): pagar un recibo desde la app ──────────────────────

export type LecturaEstadoRecibo =
  | { tipo: 'pagado'; renovadoHasta: string | null }
  | { tipo: 'en_proceso'; esperaMinMs?: number }
  | { tipo: 'sesion' }
  | { tipo: 'dos-pasos' };

/**
 * «Pagado» SOLO cuando el servidor lee el recibo COBRADO (`situacionRecibo`). Que
 * Stripe haya cerrado el Checkout no basta: lo confirma el webhook.
 */
export function leerEstadoRecibo(status: number, retryAfter: string | null, cuerpo: unknown): LecturaEstadoRecibo {
  const base = leerEstadoCompra(status, retryAfter, cuerpo);
  if (base.tipo === 'sesion' || base.tipo === 'dos-pasos') return base;
  if (base.tipo === 'en_proceso' && base.esperaMinMs) return base;
  const r = (cuerpo && typeof cuerpo === 'object' ? (cuerpo as { recibo?: { situacion?: unknown; renovadoHasta?: unknown } }).recibo : undefined);
  if (status >= 200 && status < 300 && r?.situacion === 'COBRADO') {
    return { tipo: 'pagado', renovadoHasta: typeof r.renovadoHasta === 'string' ? r.renovadoHasta : null };
  }
  return { tipo: 'en_proceso' };
}
