// ─────────────────────────────────────────────────────────────────────────────
// Arrastrar y soltar (Fase 2 del calendario) — conversión px→minutos, snap y
// nuevo horario. Puro: no sabe nada de Pointer Events ni de conflictos —
// el caller (page.tsx) reutiliza detectarConflictos/hayConflicto ya
// existentes (lib/calendar-logic.ts) sobre el resultado de estas funciones.
// ─────────────────────────────────────────────────────────────────────────────

/** Snap a cuartos de hora — mismo intervalo que la rejilla de fondo
 *  (repeating-linear-gradient) en VistaDiaSalas/VistaSemana. */
export const PASO_ARRASTRE_MIN = 15;

export function redondearAIntervalo(minutos: number, paso: number = PASO_ARRASTRE_MIN): number {
  return Math.round(minutos / paso) * paso;
}

// `offsetYPx`: distancia en px desde el borde superior de la COLUMNA (no de
// la ventana con scroll — getBoundingClientRect() del caller ya refleja el
// scroll aplicado, no hace falta restarlo aquí). Puede devolver un valor
// fuera de [horaInicioMin, horaFinMin] si se suelta por encima/debajo de la
// rejilla — el caller decide si rechaza ese caso, esta función no clampa.
export function minutosDesdeOffset(offsetYPx: number, pxPorHora: number, horaInicioMin: number): number {
  return redondearAIntervalo(horaInicioMin + (offsetYPx / pxPorHora) * 60);
}

export interface HorarioMovido {
  inicioMin: number;
  finMin: number;
}

// La duración se conserva SIEMPRE al arrastrar — alargar/acortar una clase
// sigue siendo trabajo del formulario de editar, no de un gesto de arrastre.
export function nuevoHorarioArrastrado(duracionMin: number, nuevoInicioMin: number): HorarioMovido {
  return { inicioMin: nuevoInicioMin, finMin: nuevoInicioMin + duracionMin };
}
