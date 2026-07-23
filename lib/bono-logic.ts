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

// C-4: ¿la socia tiene derecho a reservar? Cierto si tiene una suscripción
// ACTIVA que sea o bien un plan MENSUAL vigente (sin fecha fin, o fin >= hoy),
// o bien un BONO/PUNTUAL con al menos una sesión restante Y no caducado (F2 B2.1:
// respeta fecha_fin también en bonos; fecha_fin null = sin caducidad). Una
// suscripción PAUSADA (congelada) nunca da derecho. hoyISO = 'YYYY-MM-DD'.
export function tieneEntitlementActivo(
  socioId: string,
  suscripciones: Suscripcion[],
  planesTarifa: PlanTarifa[],
  hoyISO: string,
): boolean {
  return suscripciones.some(sus => {
    if (sus.socioId !== socioId || sus.estado !== 'ACTIVA') return false;
    const plan = planesTarifa.find(p => p.id === sus.planId);
    if (!plan) return false;
    const vigente = !sus.fechaFin || sus.fechaFin >= hoyISO;
    if (plan.tipo === 'MENSUAL') return vigente;
    return (plan.tipo === 'BONO' || plan.tipo === 'PUNTUAL') && (sus.sesionesRestantes ?? 0) > 0 && vigente;
  });
}

// ── F2 · Bonos con validez / límite / congelación (puras, testeables) ─────────

// Fecha de caducidad de un bono al comprarlo: fecha_inicio + validez_dias, en
// 'YYYY-MM-DD'. null si el plan no caduca (validezDias null). Acepta fechaInicio
// como fecha o timestamp ISO — usa solo la parte de fecha (UTC).
export function calcularFechaFinBono(fechaInicioISO: string, validezDias: number | null): string | null {
  if (validezDias === null || validezDias <= 0) return null;
  const base = new Date(`${fechaInicioISO.slice(0, 10)}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + validezDias);
  return base.toISOString().slice(0, 10);
}

// ¿La socia ya alcanzó el tope semanal del bono? reservasEnSemana = reservas
// CONFIRMADA/ASISTIDA suyas en la misma semana ISO (lo cuenta quien llama, con
// contexto de reservas+sesiones). Sin tope (null) nunca supera.
export function superaLimiteSemanal(reservasEnSemana: number, limiteSemanal: number | null): boolean {
  return limiteSemanal !== null && reservasEnSemana >= limiteSemanal;
}

// Nueva fecha_fin tras una congelación: se empuja por los días congelados
// [desde, hasta] para que no consuman la validez. null si no había caducidad.
export function nuevaFechaFinTrasCongelar(fechaFin: string | null, desdeISO: string, hastaISO: string): string | null {
  if (!fechaFin) return null;
  const dias = Math.max(0, Math.round(
    (Date.parse(`${hastaISO.slice(0, 10)}T00:00:00Z`) - Date.parse(`${desdeISO.slice(0, 10)}T00:00:00Z`)) / 86_400_000,
  ));
  const fin = new Date(`${fechaFin.slice(0, 10)}T00:00:00Z`);
  fin.setUTCDate(fin.getUTCDate() + dias);
  return fin.toISOString().slice(0, 10);
}
