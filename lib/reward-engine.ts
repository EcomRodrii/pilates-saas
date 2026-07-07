import type { RewardRule, RewardAction, RewardTrigger, RewardTriggerDef } from '@/lib/types';

// Catálogo de disparadores que la app sabe detectar. El estudio no puede
// inventar disparadores nuevos (eso requiere código), pero SÍ configura
// cuántos créditos vale cada uno — eso vive en RewardRule, nunca aquí.
export const REWARD_TRIGGERS: RewardTriggerDef[] = [
  { trigger: 'ASISTENCIA_CLASE', nombre: 'Asistir a clase', descripcion: 'La socia hace check-in en una reserva confirmada.' },
  { trigger: 'RENOVACION_PLAN', nombre: 'Renovar plan', descripcion: 'Se cobra un recibo de renovación de su plan o bono.' },
  { trigger: 'REFERIDO_AMIGO', nombre: 'Traer un amigo', descripcion: 'Un amigo referido se da de alta como nueva socia.' },
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
