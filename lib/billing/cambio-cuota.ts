// ─────────────────────────────────────────────────────────────────────────────
// Cambiar de cuota a una más cara cobrando la diferencia: las REGLAS.
//
// La ruta (`app/api/suscripciones/cambiar-con-diferencia`) lee y escribe; aquí
// está lo que DECIDE, para poder probarlo sin base de datos. Nada de lo que
// manda el navegador se da por bueno: el importe se RECALCULA con
// `diferenciaCambioPlan` y el que trae la petición solo sirve para comprobar que
// la persona confirmó el mismo que el servidor calcula ahora (si pasó la
// medianoche entre la vista previa y el «confirmar», la cifra cambia y se le
// enseña la nueva antes de cobrar nada).
//
// Qué hace el cambio (lo ejecuta `cambiar_cuota_con_diferencia`, todo o nada):
//   · la cuota nueva HEREDA la fecha de renovación: el siguiente cobro, por el
//     plan nuevo entero, llega el mismo día de siempre;
//   · el recibo de la diferencia nace PENDIENTE y se cobra por los caminos de
//     siempre (tarjeta guardada o «marcar cobrado»);
//   · bajar a un plan más barato NO pasa por aquí: sin cobro ni reembolso.
// ─────────────────────────────────────────────────────────────────────────────

import { diferenciaCambioPlan, aCentimos, type DiferenciaCambioPlan } from './prorrateo.ts';
import { mesesDeCiclo } from '../bono-logic.ts';
import type { PlanTarifa } from '../types.ts';

export interface CuotaDelCambio {
  id: string;
  socioId: string | null;
  estado: string;
  fechaFin: string | null;
  planId: string | null;
  /** Cuota gestionada por Stripe: no se cambia desde aquí (Stripe seguiría cobrando la vieja). */
  stripeSubscriptionId?: string | null;
}

export interface PlanDelCambio {
  id: string;
  nombre: string;
  tipo: string;
  precio: number;
  activo: boolean;
  periodicidadMeses?: number | null;
}

export type PlanDeCambio =
  | { ok: true; diferencia: DiferenciaCambioPlan; importe: number; concepto: string }
  | { ok: false; status: 400 | 404 | 409; error: string; codigo: string; importe?: number };

/**
 * ¿Se puede cambiar esta cuota a este plan cobrando la diferencia, y cuánto?
 * `recibosSinCobrar`: la cuota actual tiene recibos pendientes (la diferencia
 * parte de que el ciclo en curso está pagado).
 */
export function planificarCambioConDiferencia(e: {
  cuota: CuotaDelCambio | null;
  planActual: PlanDelCambio | null;
  planNuevo: PlanDelCambio | null;
  socioId: string;
  recibosSinCobrar: boolean;
  hoyISO: string;
  /** Lo que la persona vio y confirmó, en euros. */
  importeConfirmado: number;
}): PlanDeCambio {
  const { cuota, planActual, planNuevo } = e;
  if (!cuota || cuota.socioId !== e.socioId) {
    return { ok: false, status: 404, codigo: 'CUOTA_NO_ENCONTRADA', error: 'No se encuentra la cuota de esta clienta.' };
  }
  if (cuota.estado !== 'ACTIVA') {
    return { ok: false, status: 409, codigo: 'CUOTA_NO_ACTIVA', error: 'Esa cuota ya no está activa (puede que el cambio ya se haya hecho). Recarga la ficha.' };
  }
  if (cuota.stripeSubscriptionId) {
    return { ok: false, status: 409, codigo: 'CUOTA_EN_STRIPE', error: 'Esta cuota la gestiona Stripe: cámbiala desde su suscripción.' };
  }
  if (!planActual || planActual.tipo !== 'MENSUAL') {
    return { ok: false, status: 409, codigo: 'NO_ES_CUOTA', error: 'Solo se cobra la diferencia al cambiar de una cuota mensual a otra.' };
  }
  if (!planNuevo || !planNuevo.activo || planNuevo.tipo !== 'MENSUAL') {
    return { ok: false, status: 404, codigo: 'PLAN_NO_VALIDO', error: 'El plan nuevo no existe, no está a la venta o no es una cuota.' };
  }
  if (planNuevo.id === planActual.id) {
    return { ok: false, status: 409, codigo: 'MISMO_PLAN', error: 'Ya tiene ese plan.' };
  }
  if (e.recibosSinCobrar) {
    return {
      ok: false, status: 409, codigo: 'RECIBOS_SIN_COBRAR',
      error: 'Esta cuota tiene un recibo sin cobrar. Cóbralo o anúlalo antes de cambiarla cobrando la diferencia.',
    };
  }
  const diferencia = diferenciaCambioPlan({
    precioActual: planActual.precio,
    precioNuevo: planNuevo.precio,
    fechaFin: cuota.fechaFin,
    mesesCicloActual: mesesDeCiclo({ periodicidadMeses: planActual.periodicidadMeses as PlanTarifa['periodicidadMeses'] }),
    mesesCicloNuevo: mesesDeCiclo({ periodicidadMeses: planNuevo.periodicidadMeses as PlanTarifa['periodicidadMeses'] }),
    hoyISO: e.hoyISO,
  });
  if (!diferencia.aplica) {
    return { ok: false, status: 409, codigo: 'SIN_DIFERENCIA', error: diferencia.motivoNo ?? 'No hay diferencia que cobrar.' };
  }
  if (aCentimos(e.importeConfirmado) !== aCentimos(diferencia.importe)) {
    return {
      ok: false, status: 409, codigo: 'IMPORTE_CAMBIADO', importe: diferencia.importe,
      error: 'El importe ha cambiado desde que lo viste. Revísalo y vuelve a confirmar.',
    };
  }
  return {
    ok: true, diferencia, importe: diferencia.importe,
    concepto: `Cambio de plan — ${planActual.nombre} → ${planNuevo.nombre} · diferencia proporcional ${diferencia.texto}`,
  };
}
