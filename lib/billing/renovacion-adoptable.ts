// ─────────────────────────────────────────────────────────────────────────────
// ¿Puede el cron adoptar un recibo de renovación para que se cobre SOLO (tarjeta o
// domiciliación guardada)? Puro y sin alias `@/`, para fijarlo con `node --test`.
//
// ⚠️ Una cuota nunca se cobra antes de su vencimiento (5-oct-2026, decisión prudente
// por defecto, a la vista del fundador). El recibo de renovación de una cuota lo
// crea el cron cuando la cuota YA venció (`generarRecibosRenovacion`: ACTIVA y
// `fecha_fin < hoy`), pero también lo crea la alumna con «Renovar mi plan» en
// cualquier momento, y el estudio desde el panel. La adopción no miraba fechas:
// una alumna que pidió renovar su cuota pausada, abrió el pago y lo dejó, se
// encontraba la cuota cobrada off-session semanas antes de vencer al reanudarla
// (meses en una trimestral o anual). Ahora la cuota solo se adopta con el MISMO
// criterio con el que el cron crea su recibo: ya vencida. Antes de eso, el recibo
// espera a su día (y se puede pagar a mano o desde la app cuando quiera).
//
// Los demás tipos (bono, clase suelta) no cambian: su recibo de renovación lo
// decide quien lo crea, y la adopción ya filtra lo demás (cuota ACTIVA, sin baja,
// con método de cobro, sin pago online abierto).
// ─────────────────────────────────────────────────────────────────────────────

export interface CuotaDelRecibo {
  /** `planes_tarifa.tipo` de la suscripción del recibo; `null` si no se pudo saber. */
  tipoPlan: string | null;
  /** `suscripciones.fecha_fin` (`yyyy-mm-dd`). */
  fechaFin: string | null;
}

/** @param hoy `yyyy-mm-dd`, el mismo «hoy» con el que el cron genera los recibos. */
export function renovacionAdoptable(c: CuotaDelRecibo, hoy: string): boolean {
  // Sin saber de qué plan es, no se cobra solo: mañana se vuelve a mirar.
  if (c.tipoPlan === null) return false;
  if (c.tipoPlan === 'MENSUAL') return !!c.fechaFin && c.fechaFin < hoy;
  return true;
}

/** El tipo de plan de una fila de `suscripciones` con `planes_tarifa(tipo)` embebido (objeto o lista). */
export function tipoPlanEmbebido(plan: unknown): string | null {
  const p = (Array.isArray(plan) ? plan[0] : plan) as { tipo?: unknown } | null | undefined;
  return typeof p?.tipo === 'string' ? p.tipo : null;
}
