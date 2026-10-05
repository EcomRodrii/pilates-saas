// ─────────────────────────────────────────────────────────────────────────────
// Qué significa lo que contesta `reservar_plaza` cuando la reserva viene de un
// PAGO ya cobrado (`reservarPlazaTrasPagoPublico`, desde el webhook y el
// conciliador). Puro y sin alias `@/`, para fijarlo con `node --test`.
//
// Aquí el dinero YA está cobrado, así que equivocarse hacia «confirmada» es
// decirle a la socia y al mostrador que todo está bien cuando no lo está: nadie
// se entera de que hay un pago que no se ha usado. Por eso ninguna de estas
// funciones supone nada que la base de datos no haya dicho.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Los estados en los que `evaluar_reserva` contesta YA_RESERVADA: la socia ya
 * tiene sitio (o cola, o aprobación pendiente) en esa clase.
 * Copia de la lista de `supabase/migrations/20261002145300_evaluar_reserva.sql`.
 */
export const ESTADOS_RESERVA_VIVA: readonly string[] = ['CONFIRMADA', 'LISTA_ESPERA', 'ASISTIDA', 'PENDIENTE_APROBACION'];

/** Lo que se lee de `reservas` para la reserva que deriva del pago (`res-web-<pi>`). */
export interface FilaReservaDelPago {
  estado: string | null;
  socio_id: string | null;
  sesion_id: string | null;
}

/**
 * El estado de la reserva DE ESTE PAGO si existe y sigue viva; `null` si no.
 *
 * Es la única pregunta que distingue los dos YA_RESERVADA posibles:
 *  · la `res-web-<pi>` ya existe y es suya → un reintento del mismo pago
 *    (webhook repetido, o webhook + conciliador): idempotente, se completa;
 *  · no existe (o no es la de esta socia y clase) → la socia ya tenía OTRA
 *    reserva en la clase (con su bono, o de otro pago): este pago no se ha usado.
 */
export function estadoDeReservaDelPago(
  fila: FilaReservaDelPago | null | undefined,
  p: { socioId: string; sesionId: string },
): string | null {
  if (!fila) return null;
  if (fila.socio_id !== p.socioId || fila.sesion_id !== p.sesionId) return null;
  if (!fila.estado || !ESTADOS_RESERVA_VIVA.includes(fila.estado)) return null;
  return fila.estado;
}

/**
 * El estado que trae la respuesta de `reservar_plaza`, o `null` si no lo trae.
 * Nunca un valor por defecto: sin estado se RELEE la reserva (ver
 * `reservarPlazaTrasPagoPublico`), porque suponer CONFIRMADA dejaba sin aviso
 * un pago que quizá no tiene plaza.
 */
export function estadoDeLaRespuesta(fila: unknown): string | null {
  const estado = (fila as { estado?: unknown } | null | undefined)?.estado;
  return typeof estado === 'string' && estado.length > 0 ? estado : null;
}
