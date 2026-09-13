// Cuándo relee el panel lo que puede haber cambiado en otra pestaña.
//
// El panel carga una vez al entrar y luego vive de su memoria. Con dos
// pestañas abiertas (o el iPad de recepción y el portátil), lo que se cambia
// en una no llega a la otra: la evaluación del 13-sep activó un bono en una
// pestaña y en la otra «Asignar plan» salía vacío y la alumna «no tenía bono».
//
// Solo al VOLVER a la pestaña y solo si estuvo oculta un rato: cambiar de
// pestaña un segundo para mirar algo no debe disparar consultas.

/** Tiempo mínimo oculta para que al volver merezca la pena releer. */
export const OCULTA_MINIMO_MS = 30_000;

/**
 * `ocultaDesde`: marca de tiempo en que la pestaña dejó de verse, o `null` si
 * no consta (nunca se ocultó, o ya se releyó al volver).
 */
export function debeReleerAlVolver(ocultaDesde: number | null, ahora: number): boolean {
  if (ocultaDesde === null) return false;
  return ahora - ocultaDesde >= OCULTA_MINIMO_MS;
}
