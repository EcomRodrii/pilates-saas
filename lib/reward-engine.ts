import type { RewardRule, RewardAction, RewardTrigger, RewardTriggerDef, MemberCredits, RewardCatalogItem } from '@/lib/types';

// Catálogo de disparadores que la app sabe detectar. El estudio no puede
// inventar disparadores nuevos (eso requiere código), pero SÍ configura
// cuántos créditos vale cada uno — eso vive en RewardRule, nunca aquí.
export const REWARD_TRIGGERS: RewardTriggerDef[] = [
  { trigger: 'ASISTENCIA_CLASE', nombre: 'Asistir a clase', descripcion: 'La socia hace check-in en una reserva confirmada.' },
  { trigger: 'RENOVACION_PLAN', nombre: 'Renovar plan', descripcion: 'Se cobra un recibo de renovación de su plan o bono.' },
  { trigger: 'REFERIDO_AMIGO', nombre: 'Traer un amigo', descripcion: 'Un amigo referido asiste a su primera clase (no basta con registrarse).' },
  { trigger: 'SEMANA_COMPLETA', nombre: 'Completar una semana', descripcion: 'Asiste a todas las clases que tenía reservadas en la semana.' },
  { trigger: 'PRIMERA_RESERVA', nombre: 'Primera reserva', descripcion: 'La socia reserva una clase por primera vez.' },
  { trigger: 'OBJETIVO_MENSUAL', nombre: 'Cumplir objetivo mensual', descripcion: 'Alcanza el objetivo de clases que se marcó para el mes.' },
];

export function reglaActivaPara(rules: RewardRule[], trigger: RewardTrigger): RewardRule | null {
  return rules.find(r => r.trigger === trigger && r.activa) ?? null;
}

// Idempotencia en memoria — el UNIQUE (studio_id, trigger, ref_id) en DB es
// el cerrojo real, esto solo evita ni siquiera intentarlo y generar ruido.
export function yaOtorgado(actions: RewardAction[], trigger: RewardTrigger, refId: string | null): boolean {
  if (!refId) return false;
  return actions.some(a => a.trigger === trigger && a.refId === refId);
}

// Decide si un disparador debe otorgar créditos: debe existir una regla activa
// con créditos > 0 y no haberse otorgado ya para ese refId (idempotencia).
export function decidirOtorgarCreditos(
  rules: RewardRule[],
  actions: RewardAction[],
  trigger: RewardTrigger,
  refId: string | null,
): { otorgar: boolean; regla: RewardRule | null } {
  const regla = reglaActivaPara(rules, trigger);
  if (!regla || regla.creditos <= 0) return { otorgar: false, regla: null };
  if (yaOtorgado(actions, trigger, refId)) return { otorgar: false, regla };
  return { otorgar: true, regla };
}

// Nuevo saldo de créditos de la socia tras GANAR créditos (crea el registro si
// aún no existía). Pura: el contexto la usa para actualizar memberCredits.
export function aplicarGananciaCreditos(
  existente: MemberCredits | undefined,
  socioId: string,
  studioId: string,
  creditos: number,
  now: string,
): MemberCredits {
  return existente
    ? { ...existente, saldo: existente.saldo + creditos, totalGanado: existente.totalGanado + creditos, actualizadoEn: now }
    : { socioId, studioId, saldo: creditos, totalGanado: creditos, totalCanjeado: 0, actualizadoEn: now };
}

// ── Canje de recompensas ──────────────────────────────────────────────────────

// Valida si una socia puede canjear una recompensa del catálogo con su saldo.
export function validarCanje(
  item: RewardCatalogItem | undefined,
  saldo: number,
): { ok: true } | { error: string } {
  if (!item || !item.activo) return { error: 'Esta recompensa ya no está disponible.' };
  if (item.stock != null && item.stock <= 0) return { error: 'Sin stock disponible.' };
  if (saldo < item.costeCreditos) return { error: 'No tienes créditos suficientes todavía.' };
  return { ok: true };
}

// Nuevo saldo tras CANJEAR: descuenta del saldo y suma al total canjeado.
export function aplicarCanjeCreditos(
  existente: MemberCredits | undefined,
  socioId: string,
  studioId: string,
  coste: number,
  now: string,
): MemberCredits {
  return existente
    ? { ...existente, saldo: existente.saldo - coste, totalCanjeado: existente.totalCanjeado + coste, actualizadoEn: now }
    : { socioId, studioId, saldo: -coste, totalGanado: 0, totalCanjeado: coste, actualizadoEn: now };
}
