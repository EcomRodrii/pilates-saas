// ─────────────────────────────────────────────────────────────────────────────
// Lógica pura del consumo de bono (sesiones de un plan BONO/PUNTUAL).
//
// Sin React ni Supabase: deterministas y testeables (ver bono-logic.test.ts).
// El god-context las usa como única fuente de verdad para descontar/devolver
// sesiones al reservar/cancelar y para detectar el bono agotado.
// ─────────────────────────────────────────────────────────────────────────────

import type { Suscripcion, PlanTarifa } from '@/lib/types';

// ── ¿Este plan cubre ESTA clase? ─────────────────────────────────────────────
//
// Un plan sin tipos de clase asignados cubre TODO — es como se han comportado
// siempre y es lo que sigue pasando por defecto. Con tipos asignados, solo esos:
// permite el "Bono 10 Reformer" que no sirve para Mat.
//
// Sin `tipoClaseId` (p. ej. al preguntar "¿tiene bono?" sin una clase concreta
// delante) se responde por el plan, no por la clase: no se puede descartar una
// cobertura que aún no sabemos si aplica.
//
// Misma semántica que `plazas_fijas.tipo_clase_id` (0078), donde null = cualquiera.
export function planCubreTipoClase(plan: PlanTarifa, tipoClaseId?: string | null): boolean {
  const tipos = plan.tiposClaseIds;
  if (!tipos || tipos.length === 0) return true;
  if (!tipoClaseId) return true;
  return tipos.includes(tipoClaseId);
}

// Encuentra la suscripción activa de bono/puntual de la socia sobre la que se
// descuenta o devuelve una sesión. Devuelve null si no aplica (sin suscripción
// activa, plan no de sesiones, o saldo no gestionado por sesiones).
export function bonoConsumible(
  socioId: string,
  suscripciones: Suscripcion[],
  planesTarifa: PlanTarifa[],
  hoyISO: string = new Date().toISOString().slice(0, 10),
  // Tipo de clase que se está reservando. Sin él se mantiene el comportamiento
  // de siempre; con él, un bono que no cubra esa clase no es candidato — si no,
  // con un "Bono Reformer" y un "Bono Mat" a la vez se descontaría del que
  // caduque antes, aunque no fuera el que cubre la clase.
  tipoClaseId?: string | null,
): { suscripcion: Suscripcion; plan: PlanTarifa; sesionesRestantes: number } | null {
  const candidatas = suscripciones.filter(s => {
    if (s.socioId !== socioId || s.estado !== 'ACTIVA' || s.sesionesRestantes === null) return false;
    const plan = planesTarifa.find(p => p.id === s.planId);
    if (!plan || (plan.tipo !== 'BONO' && plan.tipo !== 'PUNTUAL')) return false;
    if (!planCubreTipoClase(plan, tipoClaseId)) return false;
    // Vigente: mismo criterio que tieneEntitlementActivo. Un bono ACTIVA pero
    // CADUCADO (fechaFin < hoy) NO se consume ni se devuelve — antes se descontaba
    // igual cuando la política del estudio no exigía plan (se saltaba esa puerta).
    return !s.fechaFin || s.fechaFin >= hoyISO;
  });
  if (candidatas.length === 0) return null;
  // Con varias activas, elección DETERMINISTA (antes cogía la primera que devolvía
  // la BD): la que caduca antes primero (consumir la más urgente); las sin
  // caducidad al final; desempate por id para estabilidad.
  candidatas.sort((a, b) => {
    const fa = a.fechaFin ?? '9999-12-31';
    const fb = b.fechaFin ?? '9999-12-31';
    return fa !== fb ? (fa < fb ? -1 : 1) : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
  const sus = candidatas[0];
  const plan = planesTarifa.find(p => p.id === sus.planId)!;
  return { suscripcion: sus, plan, sesionesRestantes: sus.sesionesRestantes! };
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
  // Con una clase concreta delante, un plan que no la cubra no vale (un bono de
  // Reformer no da derecho a reservar Mat). Sin ella se responde por el plan.
  tipoClaseId?: string | null,
): boolean {
  return suscripciones.some(sus => {
    if (sus.socioId !== socioId || sus.estado !== 'ACTIVA') return false;
    const plan = planesTarifa.find(p => p.id === sus.planId);
    if (!plan) return false;
    if (!planCubreTipoClase(plan, tipoClaseId)) return false;
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

/**
 * ¿Tiene sentido exigir plan para reservar? Solo si el estudio vende alguno.
 *
 * Desde la 0109 el ajuste «exigir plan o bono activo» viene ACTIVADO de fábrica,
 * que es lo correcto para un estudio en marcha. Pero un estudio recién creado lo
 * tiene activado y todavía no ha creado ni un plan: su primera clienta vería
 * «necesitas un plan o bono activo» y, al ir a contratarlo, nada que comprar.
 * Un callejón sin salida en el primer minuto de vida del negocio.
 *
 * Exigir algo que no se puede conseguir no protege nada: solo bloquea. Cuando la
 * dueña crea su primer plan, el gate empieza a aplicar solo.
 */
export function hayAlgoQueContratar(planes: { activo: boolean }[]): boolean {
  return planes.some(p => p.activo);
}
