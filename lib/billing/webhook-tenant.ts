// ─────────────────────────────────────────────────────────────────────────────
// ¿De qué estudio es este evento de Stripe?
//
// La respuesta NO puede salir de `metadata.studioId`: esa la elige quien crea la
// sesión de checkout, o sea cualquier estudio con acceso a su propia cuenta
// Connect. Sale de la cuenta que FIRMA el evento (`event.account`), resuelta
// contra `studios.stripe_account_id`, y la metadata solo puede confirmarla.
//
// El bug que lo motiva era una condición que cortocircuitaba:
//
//     if (event.account && studioRow?.stripe_account_id && event.account !== …)
//
// Con el estudio víctima SIN Stripe conectado —7 de los 9 de producción—, el
// segundo término es falso y la comprobación entera se salta. Un estudio A podía
// crear un checkout en su cuenta con `metadata.studioId = B` y el recibo de B,
// pagarlo a su propia cuenta (dinero que se autoreembolsa después), y el webhook
// marcaba el recibo de B COBRADO y le aplicaba la renovación. La rama de compra
// de plan no comprobaba nada en absoluto.
//
// No se pierde ningún camino legítimo: `app/api/stripe/checkout` exige
// `studio.stripe_account_id` antes de crear la sesión y la crea siempre con
// `{ stripeAccount }`, así que un evento de pago que diga ser de un estudio sin
// cuenta conectada es imposible por construcción.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `studioDeCuenta` es lo que devuelve resolver `event.account` contra
 * `studios.stripe_account_id` (`null` si la cuenta no es de nadie conocido, o si
 * el evento no trae cuenta). `studioIdMetadata` es lo que dice el evento.
 *
 * Autoriza solo si la cuenta resuelve a un estudio Y la metadata, cuando viene,
 * nombra a ese mismo. Sin cuenta reconocida no se autoriza nada: es justo el
 * caso que antes pasaba de largo.
 */
export function tenantAutorizado(
  studioDeCuenta: string | null,
  studioIdMetadata: string | null | undefined,
): boolean {
  if (!studioDeCuenta) return false;
  if (!studioIdMetadata) return true;
  return studioDeCuenta === studioIdMetadata;
}

/**
 * Cuenta de Stripe contra la que hay que resolver el estudio.
 *
 * Normalmente es `event.account`: el cargo es directo sobre la cuenta conectada
 * del estudio y Stripe firma el evento con ella. Pero cuando el
 * `stripe_account_id` de un estudio ES la propia cuenta de la plataforma
 * —le pasa al estudio de demostración de Tentare, que es además el único que ha
 * cobrado de verdad—, Stripe considera el cobro "de tu cuenta" y entrega el
 * evento SIN `account`. Ahí `event.account` es `undefined`, no resolvía ningún
 * estudio y `tenantAutorizado` lo rechazaba con un 403.
 *
 * No se debilita nada: la cuenta de plataforma sale de preguntarle a Stripe por
 * nuestra propia clave de API, nunca de la metadata del evento. Un evento sin
 * `account` solo puede venir de la cuenta de la plataforma — es justo lo que
 * significa que Stripe no informe ese campo.
 */
export function cuentaFirmante(
  eventAccount: string | null | undefined,
  cuentaPlataforma: string | null,
): string | null {
  return eventAccount ?? cuentaPlataforma;
}
