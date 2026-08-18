// Severidad visible (arquitectura Centro de Control §5): deriva un badge
// 🔥/⚠️/ℹ️ de campos que YA existen en cada recomendación — no es un dato
// nuevo, es una lectura consistente de prioridad/riesgo/confianza que antes
// solo se usaba a medias (un boxShadow rojo en RecommendationCard, nada en
// VeredictoDelDia).
export type NivelSeveridad = 'CRITICO' | 'IMPORTANTE' | 'RECOMENDACION';

export const SEVERIDAD_INFO: Record<NivelSeveridad, { emoji: string; label: string; color: string; bg: string }> = {
  CRITICO: { emoji: '🔥', label: 'Crítico', color: 'var(--destructive)', bg: 'color-mix(in srgb, var(--destructive) 12%, var(--card))' },
  IMPORTANTE: { emoji: '⚠️', label: 'Importante', color: 'var(--warning)', bg: 'color-mix(in srgb, var(--warning) 12%, var(--card))' },
  RECOMENDACION: { emoji: 'ℹ️', label: 'Recomendación', color: 'var(--brand-secondary)', bg: 'color-mix(in srgb, var(--brand-secondary) 10%, var(--card))' },
};

export function severidad(prioridad: 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAJA', riesgo: 'PERDIDA' | 'OPORTUNIDAD', confianzaNivel: 'ALTA' | 'MEDIA' | 'BAJA'): NivelSeveridad {
  if (prioridad === 'CRITICA') return 'CRITICO';
  if (riesgo === 'PERDIDA' && confianzaNivel !== 'BAJA') return 'IMPORTANTE';
  return 'RECOMENDACION';
}

// Nivel de "Más situaciones" (reorganización Centro de Control): a diferencia
// de `severidad` (badge de Prioridades/VeredictoDelDia), este deriva SOLO de
// `prioridad` — ya es el resultado de impacto×confianza×urgencia×esfuerzo, no
// hace falta recalcular nada. Tres niveles con vocabulario de acción, no de
// alarma: "Señal" es explícitamente NO una recomendación de actuar todavía.
export type NivelSituacion = 'ACCION_RECOMENDADA' | 'REVISAR' | 'SENAL';

export const NIVEL_SITUACION_INFO: Record<NivelSituacion, { label: string; color: string; bg: string }> = {
  ACCION_RECOMENDADA: { label: 'Acción recomendada', color: 'var(--destructive)', bg: 'color-mix(in srgb, var(--destructive) 10%, var(--card))' },
  REVISAR: { label: 'Revisar', color: 'var(--warning)', bg: 'color-mix(in srgb, var(--warning) 10%, var(--card))' },
  SENAL: { label: 'Señal', color: 'var(--muted-foreground)', bg: 'var(--muted)' },
};

export function nivelSituacion(prioridad: 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAJA'): NivelSituacion {
  if (prioridad === 'CRITICA' || prioridad === 'ALTA') return 'ACCION_RECOMENDADA';
  if (prioridad === 'MEDIA') return 'REVISAR';
  return 'SENAL';
}
