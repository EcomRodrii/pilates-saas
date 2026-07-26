// ─────────────────────────────────────────────────────────────────────────────
// Quién de tu equipo IMPARTE clases.
//
// `instructores` es la tabla del STAFF completo, no solo de las instructoras:
// una recepcionista es una fila más, distinguida por `rol`. Toda la UI la
// trataba como "instructora", así que recepción salía en los desplegables de
// asignar clase, en el diagnóstico de "quién no tiene disponibilidad" y —lo
// peor— en el listado público de profesorado del portal y de reservar.
//
// La propietaria SÍ cuenta: en la mayoría de estudios pequeños da clases.
// Módulo puro y sin 'use client': lo usan también el portal (server component)
// y las rutas de API.
// ─────────────────────────────────────────────────────────────────────────────

/** Lo mínimo para decidir. `rol` ausente = INSTRUCTOR (es el default de la BD). */
export interface MiembroDeEquipo {
  rol?: string | null;
  activo?: boolean | null;
}

/** ¿Esta persona puede dar una clase? Recepción no; el resto del staff sí. */
export function imparteClases(m: MiembroDeEquipo): boolean {
  return (m.rol ?? 'INSTRUCTOR') !== 'RECEPCION';
}

/**
 * Las asignables a una clase o cita: en plantilla (activas) y que impartan.
 * Es el filtro que faltaba en los desplegables — filtraban solo por `activo`.
 */
export function queImparten<T extends MiembroDeEquipo>(equipo: T[]): T[] {
  return equipo.filter(i => i.activo !== false && imparteClases(i));
}
