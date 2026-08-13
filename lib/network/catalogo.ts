// Catálogos fijos de Tentare Network — docs/NETWORK-IMPLEMENTATION-PLAN.md §2.
//
// Sin tabla en BD a propósito: mismo patrón que ROLES_VALIDOS
// (app/api/equipo/route.ts) o tipos_clase.nivel. Añadir una especialidad
// nueva es cambiar esta lista, no una migración — y evita duplicar la
// taxonomía de `tipos_clase`, que es del ESTUDIO, no de la persona.

export const ESPECIALIDADES_NETWORK = ['reformer', 'mat', 'maquina', 'yoga', 'hiit', 'otro'] as const;
export type EspecialidadNetwork = (typeof ESPECIALIDADES_NETWORK)[number];

export const ESPECIALIDAD_LABEL: Record<EspecialidadNetwork, string> = {
  reformer: 'Reformer',
  mat: 'Mat',
  maquina: 'Máquina',
  yoga: 'Yoga',
  hiit: 'HIIT',
  otro: 'Otro',
};

export const HORARIOS_NETWORK = ['mananas', 'tardes', 'noches', 'fines_semana'] as const;
export type HorarioNetwork = (typeof HORARIOS_NETWORK)[number];

export const HORARIO_LABEL: Record<HorarioNetwork, string> = {
  mananas: 'Mañanas',
  tardes: 'Tardes',
  noches: 'Noches',
  fines_semana: 'Fines de semana',
};

export const TIPOS_TRABAJO_NETWORK = [
  'jornada_completa', 'media_jornada', 'freelance', 'sustituciones', 'clases_puntuales',
] as const;
export type TipoTrabajoNetwork = (typeof TIPOS_TRABAJO_NETWORK)[number];

export const TIPO_TRABAJO_LABEL: Record<TipoTrabajoNetwork, string> = {
  jornada_completa: 'Jornada completa',
  media_jornada: 'Media jornada',
  freelance: 'Freelance',
  sustituciones: 'Sustituciones',
  clases_puntuales: 'Clases puntuales',
};

export const TARIFAS_RANGO_NETWORK = ['20-25', '25-30', '30-35', 'a_negociar'] as const;
export type TarifaRangoNetwork = (typeof TARIFAS_RANGO_NETWORK)[number];

export const TARIFA_RANGO_LABEL: Record<TarifaRangoNetwork, string> = {
  '20-25': '20–25 €/h',
  '25-30': '25–30 €/h',
  '30-35': '30–35 €/h',
  a_negociar: 'A negociar',
};

export const DISPONIBILIDAD_ESTADOS_NETWORK = [
  'disponible', 'disponible_sustituciones', 'buscando_trabajo', 'no_disponible',
] as const;
export type DisponibilidadEstadoNetwork = (typeof DISPONIBILIDAD_ESTADOS_NETWORK)[number];

export const DISPONIBILIDAD_ESTADO_LABEL: Record<DisponibilidadEstadoNetwork, string> = {
  disponible: 'Disponible',
  disponible_sustituciones: 'Disponible para sustituciones',
  buscando_trabajo: 'Buscando trabajo',
  no_disponible: 'No disponible',
};

export function esEspecialidadValida(v: unknown): v is EspecialidadNetwork {
  return typeof v === 'string' && (ESPECIALIDADES_NETWORK as readonly string[]).includes(v);
}
export function esHorarioValido(v: unknown): v is HorarioNetwork {
  return typeof v === 'string' && (HORARIOS_NETWORK as readonly string[]).includes(v);
}
export function esTipoTrabajoValido(v: unknown): v is TipoTrabajoNetwork {
  return typeof v === 'string' && (TIPOS_TRABAJO_NETWORK as readonly string[]).includes(v);
}
export function esTarifaRangoValida(v: unknown): v is TarifaRangoNetwork {
  return typeof v === 'string' && (TARIFAS_RANGO_NETWORK as readonly string[]).includes(v);
}
export function esDisponibilidadEstadoValido(v: unknown): v is DisponibilidadEstadoNetwork {
  return typeof v === 'string' && (DISPONIBILIDAD_ESTADOS_NETWORK as readonly string[]).includes(v);
}
