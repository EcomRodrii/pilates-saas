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

/**
 * Una cuota que todavía no ha vencido (o sin fecha de fin): su renovación no se cobra
 * sola por NINGÚN camino automático (adopción, cobro diario, remesa). `hoy` y
 * `fechaFin` en `yyyy-mm-dd`.
 */
export function cuotaAunSinVencer(c: CuotaDelRecibo, hoy: string): boolean {
  return c.tipoPlan === 'MENSUAL' && (!c.fechaFin || c.fechaFin >= hoy);
}

/**
 * El primer día en que la renovación de una cuota se puede cobrar sola: el siguiente
 * a su `fecha_fin` (el mismo en que `generarRecibosRenovacion` la daría por vencida).
 * La adopción programa ahí el reintento en vez de dejar el recibo sin cobro automático
 * hasta entonces (y diciendo «no tiene tarjeta» a quien sí la tiene).
 */
export function primerDiaDeCobro(fechaFin: string): string {
  const d = new Date(`${fechaFin}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export type MotivoRenovacionEnEspera = 'CUOTA_SIN_VENCER' | 'CUOTA_PAUSADA' | 'CUOTA_CANCELADA';

export interface RenovacionDeCuota {
  esRenovacion: boolean | null;
  tipoPlan: string | null;
  fechaFin: string | null;
  estadoCuota: string | null;
  /** `recibos.tras_cancelar_cuota`: lo que se decidió al cancelar la cuota. */
  trasCancelarCuota: string | null;
}

/**
 * ¿Esta renovación de CUOTA espera, en vez de cobrarse sin que la alumna la pague ella
 * (remesa del banco)? La misma regla que el cobro automático (`puedeIntentarCobro`,
 * `renovacionAdoptable`): ni en pausa, ni cancelada sin «sigue reintentando», ni antes
 * de vencer. Revisión del 5-oct (#11): una renovación pedida desde la app y abandonada
 * acababa en la remesa semanas antes del vencimiento, o con la cuota ya cancelada.
 * `null` = no espera (o no es una renovación de cuota: eso lo decide quien lo creó).
 */
export function renovacionDeCuotaEnEspera(r: RenovacionDeCuota, hoy: string): MotivoRenovacionEnEspera | null {
  if (r.esRenovacion !== true || r.tipoPlan !== 'MENSUAL') return null;
  if (r.estadoCuota === 'PAUSADA') return 'CUOTA_PAUSADA';
  if ((r.estadoCuota === 'CANCELADA' || r.estadoCuota === 'EXPIRADA') && r.trasCancelarCuota !== 'REINTENTAR') return 'CUOTA_CANCELADA';
  if (cuotaAunSinVencer({ tipoPlan: r.tipoPlan, fechaFin: r.fechaFin }, hoy)) return 'CUOTA_SIN_VENCER';
  return null;
}

/** El tipo de plan de una fila de `suscripciones` con `planes_tarifa(tipo)` embebido (objeto o lista). */
export function tipoPlanEmbebido(plan: unknown): string | null {
  const p = (Array.isArray(plan) ? plan[0] : plan) as { tipo?: unknown } | null | undefined;
  return typeof p?.tipo === 'string' ? p.tipo : null;
}
