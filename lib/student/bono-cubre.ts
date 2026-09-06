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
 * `elegirBono` (lib/bono-logic.ts) —«la que caduca antes primero; las sin
 * caducidad al final; desempate por id»— y esta función usaba otra («prefiere
 * el acotado, si no el primero del array»).
 *
 * Con un bono general que caduca mañana y uno acotado que caduca el mes que
 * viene, el servidor gastaba el GENERAL y la app le enseñaba el ACOTADO. La
 * alumna veía descontarse un bono distinto del que se le dijo. Preferir el
 * acotado es una idea defendible, pero no es la regla que ejecuta el dinero, y
 * aquí solo puede haber una.
 */
export function bonoParaClase<T extends BonoMin>(bonos: T[], tipoClaseId: string | null | undefined): T | null {
  const validos = bonos.filter((b) => b.estado === 'activo' && tieneSaldo(b) && cubreTipo(b, tipoClaseId));
  if (validos.length === 0) return null;
  return [...validos].sort(compararPorCaducidad)[0] ?? null;
}

/**
 * El orden del servidor, copiado literal de `elegirBono` (lib/bono-logic.ts).
 *
 * Vive aquí y no se importa de allí porque este fichero no puede tener imports
 * con alias `@/` (ver la cabecera). El test de paridad lo ata a la fuente.
 */
export function compararPorCaducidad(a: BonoMin, b: BonoMin): number {
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
