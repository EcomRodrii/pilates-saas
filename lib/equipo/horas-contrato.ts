// Comparar las horas que una instructora tiene en el calendario contra las que
// dice su contrato. Lógica pura: la pinta el diálogo de horas de /equipo.
//
// Hasta ahora el panel solo sabía decir "horas de este mes", una cifra sola que
// no responde a la pregunta que hace quien lleva el estudio: ¿le estoy dando lo
// que le pago? Faltaban las dos mitades que lo convierten en respuesta —
// distinguir lo ya dado de lo que queda por dar, y tener contra qué comparar.

/** Una clase de la instructora en el periodo mirado. */
export interface ClaseImpartida {
  /** Inicio en ISO/Date; solo se usa para saber si ya ocurrió. */
  inicio: Date;
  horas: number;
}

export interface ResumenHoras {
  /** Todo lo que tiene en el calendario ese mes (haya pasado o no). */
  asignadas: number;
  /** Lo que ya ha ocurrido: su clase terminó antes de ahora. */
  realizadas: number;
  /** Lo que queda por delante. `asignadas - realizadas`. */
  pendientes: number;
  /** Equivalente mensual del contrato, o null si no hay contrato definido. */
  contratoMes: number | null;
  /** `asignadas - contratoMes`. Positivo = por encima. null sin contrato. */
  diferencia: number | null;
}

/**
 * Equivalente mensual de un contrato semanal, con la convención de nómina de
 * toda la vida: 52 semanas repartidas en 12 meses (≈ 4,33 semanas/mes).
 *
 * La alternativa —comparar semana a semana— parece más honesta pero no lo es
 * dentro de una vista mensual: las semanas que cruzan de mes se quedan a medias
 * y salen siempre "por debajo de contrato" sin que nadie haya trabajado de
 * menos. Esto es una convención conocida y se etiqueta como tal en pantalla.
 */
export function equivalenteMensual(horasSemanales: number): number {
  return (horasSemanales * 52) / 12;
}

/**
 * Reparte las horas del mes en asignadas / realizadas y las compara con el
 * contrato. `ahora` se pasa como parámetro (nunca `new Date()` aquí dentro)
 * para que el cálculo sea determinista y testeable.
 */
export function resumenHoras(
  clases: readonly ClaseImpartida[],
  ahora: Date,
  horasSemanalesContrato: number | null,
): ResumenHoras {
  let asignadas = 0;
  let realizadas = 0;
  for (const c of clases) {
    asignadas += c.horas;
    if (c.inicio.getTime() < ahora.getTime()) realizadas += c.horas;
  }
  const pendientes = Math.max(0, asignadas - realizadas);
  // Un contrato a 0 h no es "sin contrato": es alguien con contrato de cero
  // horas, y comparar contra 0 es correcto. Solo `null` significa que no hay
  // nada que comparar.
  const contratoMes = horasSemanalesContrato == null ? null : equivalenteMensual(horasSemanalesContrato);
  return {
    asignadas,
    realizadas,
    pendientes,
    contratoMes,
    diferencia: contratoMes == null ? null : asignadas - contratoMes,
  };
}
