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

// Estado de un especialista ("Mi Equipo" / "Tu cartera"): fuente única —
// auditoría de arquitectura (22-sep-2026) encontró la misma tabla
// EXCELENTE/BUENO/ATENCION/CRITICO duplicada, byte a byte, en la antigua
// `SpecialistCard` (hoy `FilaEspecialista`) y (sin EXCELENTE) en
// `EspecialistaCartera`, "alineados a mano" según su propio comentario. Un
// solo sitio para que no puedan divergir por un cambio en uno de los dos.
export type EstadoEspecialista = 'EXCELENTE' | 'BUENO' | 'ATENCION' | 'CRITICO';

export const ESTADO_ESPECIALISTA_INFO: Record<EstadoEspecialista, { label: string; color: string; bg: string }> = {
  // 'EXCELENTE' lo emite el director cuando hay CERO recomendaciones
  // pendientes (lib/decision/director.ts), que no es lo mismo que "el negocio
  // va excelente": la etiqueta se ajusta a lo que el dato significa.
  EXCELENTE: { label: 'Al día', color: 'var(--success)', bg: 'color-mix(in srgb, var(--success) 12%, var(--card))' },
  BUENO: { label: 'Bueno', color: 'var(--success)', bg: 'color-mix(in srgb, var(--success) 12%, var(--card))' },
  ATENCION: { label: 'Atención', color: 'var(--warning)', bg: 'color-mix(in srgb, var(--warning) 12%, var(--card))' },
  CRITICO: { label: 'Crítico', color: 'var(--destructive)', bg: 'color-mix(in srgb, var(--destructive) 12%, var(--card))' },
};
