// ─────────────────────────────────────────────────────────────────────────────
// Por qué entró cada cobro (decisión 12 del rediseño de Informes, 2-oct-2026):
// «Ventas por tipo» según el MOTIVO del cobro, no según lo que diga su concepto.
//
// La primera regla que se cumple manda, y casi todas miran el ID del recibo,
// que lleva el motivo dentro por construcción (`rec-pos-<venta>`,
// `rec-cita-<cita>`, `rec-suelta-<reserva>`, `rec-penaliz-<penalización>`,
// `rec-web-mat-<pago>`): es lo que hace que un mismo motivo no se cobre dos veces,
// así que no se puede quedar viejo. Lo demás, por el TIPO del plan de su
// suscripción. Nunca por `concepto`: es texto libre que escribe una persona
// («Renovación…», «Bono 10 ✨») y una cifra de dinero no puede depender de él.
//
// ⚠️ Caja = el ticket ENTERO del TPV (decisión F4), aunque lleve un bono dentro:
// el recibo `rec-pos-*` es uno por ticket, sin suscripción. Matrícula y
// penalizaciones van a «Otros».
//
// Puro: se prueba con `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

import { PREFIJO_RECIBO_DE_CITA, PREFIJO_RECIBO_DE_CLASE_SUELTA } from '../cobros/recibo-de-cita.ts';
import { PREFIJO_RECIBO_DE_VENTA_DE_CAJA } from '../billing/devolucion-reglas.ts';
import { PREFIJO_RECIBO_PENALIZACION } from '../billing/penalizacion-aprobar-reglas.ts';
import type { TipoPlan } from '../types.ts';

export type MotivoCobro = 'CUOTA' | 'BONO' | 'CLASE_SUELTA' | 'SESION_PRIVADA' | 'CAJA' | 'OTROS';

export const ORDEN_MOTIVOS: readonly MotivoCobro[] = ['CUOTA', 'BONO', 'CLASE_SUELTA', 'SESION_PRIVADA', 'CAJA', 'OTROS'];

export const TEXTO_MOTIVO: Record<MotivoCobro, string> = {
  CUOTA: 'Cuotas',
  BONO: 'Bonos',
  CLASE_SUELTA: 'Clases sueltas',
  SESION_PRIVADA: 'Sesiones privadas',
  CAJA: 'Caja (TPV)',
  OTROS: 'Otros',
};

/** Qué cae en «Otros», para decirlo debajo de la cifra en vez de dejarla muda. */
export const NOTA_OTROS = 'Matrículas, penalizaciones y cobros sueltos sin plan';

/** La matrícula de una compra online (`lib/billing/ids-compra.ts`). La del mostrador no lleva plan y cae en «Otros» igual. */
export const PREFIJO_RECIBO_DE_MATRICULA_WEB = 'rec-web-mat-';

const POR_TIPO_DE_PLAN: Record<TipoPlan, MotivoCobro> = {
  MENSUAL: 'CUOTA',
  BONO: 'BONO',
  PUNTUAL: 'CLASE_SUELTA',
};

export interface ReciboConMotivo {
  id: string;
  suscripcionId?: string | null;
}

/** El tipo del plan de una suscripción, o `undefined` si ya no se sabe (plan o suscripción borrados). */
export type TipoDePlanDe = (suscripcionId: string) => TipoPlan | undefined;

export function motivoDelCobro(r: ReciboConMotivo, tipoDePlanDe: TipoDePlanDe): MotivoCobro {
  if (r.id.startsWith(PREFIJO_RECIBO_DE_VENTA_DE_CAJA)) return 'CAJA';
  if (r.id.startsWith(PREFIJO_RECIBO_DE_CITA)) return 'SESION_PRIVADA';
  if (r.id.startsWith(PREFIJO_RECIBO_DE_CLASE_SUELTA)) return 'CLASE_SUELTA';
  if (r.id.startsWith(PREFIJO_RECIBO_PENALIZACION)) return 'OTROS';
  if (r.id.startsWith(PREFIJO_RECIBO_DE_MATRICULA_WEB)) return 'OTROS';
  if (r.suscripcionId) {
    const tipo = tipoDePlanDe(r.suscripcionId);
    if (tipo) return POR_TIPO_DE_PLAN[tipo] ?? 'OTROS';
  }
  return 'OTROS';
}

/** El buscador de tipo de plan por suscripción, a partir de los arrays del contexto. */
export function tipoDePlanPorSuscripcion(
  suscripciones: readonly { id: string; planId: string }[],
  planes: readonly { id: string; tipo: TipoPlan }[],
): TipoDePlanDe {
  const tipoPorPlan = new Map(planes.map(p => [p.id, p.tipo]));
  const planPorSuscripcion = new Map(suscripciones.map(s => [s.id, s.planId]));
  return (suscripcionId) => {
    const plan = planPorSuscripcion.get(suscripcionId);
    return plan ? tipoPorPlan.get(plan) : undefined;
  };
}
