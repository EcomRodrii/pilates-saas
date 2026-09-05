// ¿Qué bono sirve para ESTA clase? Sin imports ni `@/` (ver push-estado.ts).
//
// Un plan puede estar acotado a ciertos tipos de clase (`plan_tipos_clase`), y
// el servidor lo aplica al reservar (`planCubreTipoClase`, lib/bono-logic.ts).
// La app elegía «el primer bono activo con saldo» sin mirar eso, así que a una
// socia con bono de Mat le decía «No pagas nada hoy» en un Reformer y el
// servidor rechazaba la reserva. Aquí se aplica la MISMA regla.

export interface BonoMin {
  estado: string;
  creditosUsados: number;
  creditosTotales: number;
  /** Vacío o ausente = sirve para cualquier tipo de clase. */
  tiposClaseIds?: string[];
}

/** La regla del servidor: sin tipos declarados, el plan vale para todo. */
export function cubreTipo(b: BonoMin, tipoClaseId: string | null | undefined): boolean {
  const tipos = b.tiposClaseIds;
  if (!tipos || tipos.length === 0) return true;
  if (!tipoClaseId) return true;
  return tipos.includes(tipoClaseId);
}

/** ¿Le queda saldo? Un bono ilimitado tiene `creditosTotales` a 0 y nunca se agota. */
function tieneSaldo(b: BonoMin): boolean {
  return b.creditosTotales === 0 || b.creditosUsados < b.creditosTotales;
}

/**
 * El bono que de verdad cubre esta clase, o `null`. Se prefiere el más
 * ESPECÍFICO (el acotado a tipos) para no gastar un bono general en una clase
 * que el acotado ya cubría.
 */
export function bonoParaClase<T extends BonoMin>(bonos: T[], tipoClaseId: string | null | undefined): T | null {
  const validos = bonos.filter((b) => b.estado === 'activo' && tieneSaldo(b) && cubreTipo(b, tipoClaseId));
  if (validos.length === 0) return null;
  const acotado = validos.find((b) => (b.tiposClaseIds?.length ?? 0) > 0);
  return acotado ?? validos[0];
}

/**
 * ¿Tiene bono activo con saldo pero NINGUNO cubre esta clase? Es el caso que
 * hay que explicar: «tienes bono, pero no vale para esta clase» no es lo mismo
 * que «no tienes bono».
 */
export function tieneBonoQueNoCubre(bonos: BonoMin[], tipoClaseId: string | null | undefined): boolean {
  const conSaldo = bonos.filter((b) => b.estado === 'activo' && tieneSaldo(b));
  return conSaldo.length > 0 && !conSaldo.some((b) => cubreTipo(b, tipoClaseId));
}
