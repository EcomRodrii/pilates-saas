// Qué hacer cuando se pide un checkout de un recibo que YA tiene una sesión de
// Stripe guardada. Vive aquí y no dentro de app/api/stripe/checkout porque el
// runner de tests de este repo solo mira `lib/**` (`npm test`), así que la
// lógica que se deja en una ruta no la ejercita nadie.

export type DecisionCheckout = 'crear' | 'reutilizar' | 'expirar-y-crear';

/** Lo que hace falta saber de la sesión previa. Recorte de Stripe.Checkout.Session. */
export type SesionPrevia = {
  status: string | null;
  url: string | null;
  payment_method_types?: string[] | null;
};

const mismosMetodos = (a: readonly string[], b: readonly string[]) =>
  [...a].sort().join(',') === [...b].sort().join(',');

/**
 * `reutilizar` es lo que impide el doble cobro: mientras haya una sesión
 * abierta para el recibo, se devuelve ESA en vez de crear otra pagable.
 *
 * `expirar-y-crear` cubre el cambio de método de pago (tarjeta ↔ Bizum), que
 * exige una sesión distinta porque `payment_method_types` es inmutable. Expirar
 * primero es lo que garantiza que no queden dos sesiones cobrables a la vez.
 */
export function decidirSesionCheckout(
  previa: SesionPrevia | null,
  metodosPedidos: readonly string[],
): DecisionCheckout {
  // Sin sesión previa, o con una que ya no se puede pagar (`complete`,
  // `expired`): no hay nada que reutilizar ni que expirar.
  if (!previa || previa.status !== 'open') return 'crear';
  // Abierta pero sin URL no sirve para mandar a nadie a pagar — y sigue siendo
  // pagable por quien ya la tenga, así que hay que expirarla, no ignorarla.
  if (!previa.url) return 'expirar-y-crear';
  return mismosMetodos(previa.payment_method_types ?? [], metodosPedidos)
    ? 'reutilizar'
    : 'expirar-y-crear';
}
