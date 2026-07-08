// ─────────────────────────────────────────────────────────────────────────────
// Lógica pura del consumo de bono (sesiones de un plan BONO/PUNTUAL).
//
// Sin React ni Supabase: deterministas y testeables (ver bono-logic.test.ts).
// El god-context las usa como única fuente de verdad para descontar/devolver
// sesiones al reservar/cancelar y para detectar el bono agotado.
// ─────────────────────────────────────────────────────────────────────────────

import type { Suscripcion, PlanTarifa } from '@/lib/types';

// Encuentra la suscripción activa de bono/puntual de la socia sobre la que se
// descuenta o devuelve una sesión. Devuelve null si no aplica (sin suscripción
// activa, plan no de sesiones, o saldo no gestionado por sesiones).
export function bonoConsumible(
  socioId: string,
  suscripciones: Suscripcion[],
  planesTarifa: PlanTarifa[],
): { suscripcion: Suscripcion; plan: PlanTarifa; sesionesRestantes: number } | null {
  const sus = suscripciones.find(s => s.socioId === socioId && s.estado === 'ACTIVA');
  if (!sus) return null;
  const plan = planesTarifa.find(p => p.id === sus.planId);
  if (!plan) return null;
  if ((plan.tipo !== 'BONO' && plan.tipo !== 'PUNTUAL') || sus.sesionesRestantes === null) return null;
  return { suscripcion: sus, plan, sesionesRestantes: sus.sesionesRestantes };
}

// Nuevo saldo tras consumir una sesión (nunca baja de 0) y si el bono queda
// agotado (lo que dispara el recibo de renovación en el contexto).
export function calcularConsumoBono(sesionesRestantes: number): { nuevasRestantes: number; agotado: boolean } {
  const nuevasRestantes = Math.max(0, sesionesRestantes - 1);
  return { nuevasRestantes, agotado: nuevasRestantes === 0 };
}

// Nuevo saldo tras devolver una sesión (al cancelar una reserva confirmada),
// sin superar el total de sesiones del plan.
export function calcularDevolucionBono(sesionesRestantes: number, planSesiones: number | null): number {
  const tope = planSesiones ?? Number.POSITIVE_INFINITY;
  return Math.min(tope, sesionesRestantes + 1);
}
