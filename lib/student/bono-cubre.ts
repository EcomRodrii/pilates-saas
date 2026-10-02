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
  /** Para ordenar igual que el servidor. Ausente = sin caducidad. */
  expiraEn?: string | null;
  /** Desempate estable, igual que el servidor. */
  id?: string;
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
 * El bono que de verdad cubre esta clase, o `null`.
 *
 * ⚠️ ORDENA IGUAL QUE EL SERVIDOR, y eso no es un detalle: la que manda es
 * `elegirBono` (lib/bono-logic.ts) y su gemela en SQL `elegir_bono_consumible`
 * —primero el bono ACOTADO a tipos de clase, luego el que caduca antes, luego el
 * id— y esta función tiene que anunciar el mismo que se va a descontar.
 *
 * Esa regla cambió el 2-oct-2026 por decisión de producto (motor de derechos): antes
 * el servidor ordenaba solo por caducidad y la app, que había preferido el acotado,
 * se alineó con él para no anunciar un bono y descontar otro. Ahora el servidor
 * también prefiere el acotado («no gastar el comodín en balde») y la app lo hereda.
 * Aquí solo puede haber una regla.
 */
export function bonoParaClase<T extends BonoMin>(bonos: T[], tipoClaseId: string | null | undefined): T | null {
  const validos = bonos.filter((b) => b.estado === 'activo' && tieneSaldo(b) && cubreTipo(b, tipoClaseId));
  if (validos.length === 0) return null;
  return [...validos].sort(compararPorElegibilidad)[0] ?? null;
}

/**
 * El orden del servidor, copiado de `elegirBono` (lib/bono-logic.ts).
 *
 * Vive aquí y no se importa de allí porque este fichero no puede tener imports
 * con alias `@/` (ver la cabecera). El test de paridad lo ata a la fuente.
 */
export function compararPorElegibilidad(a: BonoMin, b: BonoMin): number {
  const ea = (a.tiposClaseIds?.length ?? 0) > 0 ? 0 : 1;
  const eb = (b.tiposClaseIds?.length ?? 0) > 0 ? 0 : 1;
  if (ea !== eb) return ea - eb;
  const fa = a.expiraEn ?? '9999-12-31';
  const fb = b.expiraEn ?? '9999-12-31';
  if (fa !== fb) return fa < fb ? -1 : 1;
  const ia = a.id ?? '';
  const ib = b.id ?? '';
  return ia < ib ? -1 : ia > ib ? 1 : 0;
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
