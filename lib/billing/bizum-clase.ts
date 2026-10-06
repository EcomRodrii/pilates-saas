// ─────────────────────────────────────────────────────────────────────────────
// El Checkout hospedado de UNA clase (Bizum, «pagar y reservar»): cuándo caduca
// (P06 · Fase A, 6-oct-2026).
//
// La sesión de Stripe vive 24 h por defecto. Pagada después de que se cierre la
// reserva de la clase, la reserva tras pagar la rechaza: dinero cobrado sin plaza.
// Así que caduca cuando se cierra la reserva (inicio − antelación mínima). Sale de
// la CLASE, no del reloj de la petición: dos peticiones del mismo intento mandan el
// mismo `expires_at` y la idempotencia de Stripe no protesta.
//
// Stripe exige entre 30 min y 24 h desde que se crea. Con menos de 30 min hasta el
// cierre no se ofrece Bizum (la tarjeta sigue): «bizum-no-disponible». Con más de
// 24 h, la de siempre (24 h), que ya acaba antes del cierre.
//
// Puro, sin `@/`.
// ─────────────────────────────────────────────────────────────────────────────

export const MINIMO_CHECKOUT_MS = 30 * 60_000;
export const MAXIMO_CHECKOUT_MS = 24 * 60 * 60_000;

export type CaducidadCheckoutDeClase =
  | { ok: true; expiresAt: number | null }
  | { ok: false; codigo: 'bizum-no-disponible'; error: string };

export function caducidadCheckoutDeClase(cierre: Date, ahoraMs: number): CaducidadCheckoutDeClase {
  const restante = cierre.getTime() - ahoraMs;
  if (!(restante >= MINIMO_CHECKOUT_MS)) {
    return {
      ok: false, codigo: 'bizum-no-disponible',
      error: 'Queda muy poco para que se cierre la reserva de esta clase: paga con tarjeta. No te hemos cobrado nada.',
    };
  }
  if (restante > MAXIMO_CHECKOUT_MS) return { ok: true, expiresAt: null };
  return { ok: true, expiresAt: Math.floor(cierre.getTime() / 1000) };
}
