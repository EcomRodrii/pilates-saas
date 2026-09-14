// ─────────────────────────────────────────────────────────────────────────────
// Ausencias de instructoras (vacaciones / baja médica) — helpers PUROS de UI.
//
// La fuente de verdad para el MOTOR de sustituciones son los bloqueos diarios
// materializados en `instructora_disponibilidad_excepciones` (migr. 0101), que
// `rankear_candidatas` ya respeta. Esto es lo otro: que la PERSONA que usa el
// panel vea que alguien está de vacaciones antes de asignarle una clase.
// ─────────────────────────────────────────────────────────────────────────────
import type { AusenciaInstructora } from '@/lib/api-client';

export const AUSENCIA_ETIQUETA: Record<AusenciaInstructora['tipo'], string> = {
  VACACIONES: 'De vacaciones',
  BAJA_MEDICA: 'De baja',
  OTRO: 'Ausente',
};

/** 'YYYY-MM-DD' en hora local (las ausencias se guardan por día, sin zona). */
export function diaLocal(d: Date | string): string {
  const f = typeof d === 'string' ? new Date(d) : d;
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
}

/**
 * La ausencia que cubre a esa instructora en esa fecha, si la hay.
 * Rango inclusivo por ambos extremos (como se registra en la UI).
 */
export function ausenciaEnFecha(
  ausencias: AusenciaInstructora[],
  instructorId: string,
  fecha: Date | string,
): AusenciaInstructora | null {
  const dia = diaLocal(fecha);
  return ausencias.find(a => a.instructorId === instructorId && a.desde <= dia && dia <= a.hasta) ?? null;
}

/** Ausencia vigente HOY (para el distintivo en la lista de Equipo). */
export function ausenciaHoy(
  ausencias: AusenciaInstructora[],
  instructorId: string,
): AusenciaInstructora | null {
  return ausenciaEnFecha(ausencias, instructorId, new Date());
}

/**
 * Lo que se lleva de una ausencia quien NO ve el detalle (recepción): quién y
 * qué días, que es lo que hace falta para no asignarle una clase. El tipo sale
 * como `OTRO` —la categoría neutra, que la UI pinta «ausente»— y el motivo
 * vacío: una baja médica no puede distinguirse de unas vacaciones. Lo decide
 * `puedeVerDetalleAusencias` (o que la ausencia sea de la propia instructora).
 */
export function ausenciaVisiblePara(a: AusenciaInstructora, verDetalle: boolean): AusenciaInstructora {
  if (verDetalle) return a;
  return { id: a.id, instructorId: a.instructorId, desde: a.desde, hasta: a.hasta, tipo: 'OTRO', motivo: null };
}

/** Texto corto para el selector: "Elena · de vacaciones". */
export function sufijoAusencia(a: AusenciaInstructora | null): string {
  if (!a) return '';
  return a.tipo === 'BAJA_MEDICA' ? ' · de baja' : a.tipo === 'VACACIONES' ? ' · de vacaciones' : ' · ausente';
}
