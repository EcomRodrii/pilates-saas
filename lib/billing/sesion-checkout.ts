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
  /**
   * Céntimos totales de la sesión (`Checkout.Session.amount_total`). M-3
   * (auditoría 22-sep): sin esto se reutilizaba una sesión abierta aunque el
   * importe del recibo hubiera cambiado desde que se creó — el recibo es
   * editable desde el panel sin ninguna condición de estado, y la sesión
   * seguía cobrando el importe VIEJO. `null` se trata como "no coincide":
   * mejor expirar de más que reutilizar una sesión de la que no se sabe el
   * importe.
   */
  amount_total?: number | null;
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
 * Cubre también el cambio de IMPORTE (M-3): si el recibo se corrigió después
 * de abrir la sesión, la sesión vieja cobraría lo que ya no toca — ni de más
 * (sobrecobro silencioso) ni de menos (el webhook la rechazaría con el dinero
 * ya cobrado de verdad, sin recibo ni factura que lo refleje).
 */
export function decidirSesionCheckout(
  previa: SesionPrevia | null,
  metodosPedidos: readonly string[],
  importeEsperadoCentimos: number,
): DecisionCheckout {
  // Sin sesión previa, o con una que ya no se puede pagar (`complete`,
  // `expired`): no hay nada que reutilizar ni que expirar.
  if (!previa || previa.status !== 'open') return 'crear';
  // Abierta pero sin URL no sirve para mandar a nadie a pagar — y sigue siendo
  // pagable por quien ya la tenga, así que hay que expirarla, no ignorarla.
  if (!previa.url) return 'expirar-y-crear';
  // El importe cambió (o no se pudo leer) desde que se creó esta sesión: no es
  // segura para reutilizar, aunque los métodos de pago coincidan.
  if (previa.amount_total !== importeEsperadoCentimos) return 'expirar-y-crear';
  return mismosMetodos(previa.payment_method_types ?? [], metodosPedidos)
    ? 'reutilizar'
    : 'expirar-y-crear';
}

/**
 * Clave de idempotencia de la Checkout Session de un RECIBO.
 *
 * ⚠️ Auditoría 2026-09-23 (PAY-3). La clave vivía en línea dentro de
 * `app/api/stripe/checkout/route.ts` y llevaba solo `(reciboId, métodos)`.
 * Cuando M-3 añadió el IMPORTE como segundo discriminante de
 * `decidirSesionCheckout`, la clave se quedó sin actualizar, y el camino
 * `expirar-y-crear` por cambio de importe quedó roto de la peor manera
 * posible: la sesión vieja YA se ha expirado y la nueva se pide con la misma
 * clave pero `unit_amount` distinto. Stripe rechaza reutilizar una clave de
 * idempotencia con parámetros distintos, el error cae en el catch genérico y
 * la socia se queda SIN poder pagar el recibo hasta que la clave caduque en
 * Stripe (~24 h). Corregir el importe de un recibo desde el panel dejaba el
 * recibo impagable durante un día.
 *
 * Añadir el importe es lo que ya hacía `claveCheckoutPlanModoA` con el
 * descuento: identifica el INTENTO, no solo el recibo. La protección de la
 * doble pestaña no se pierde — dos peticiones simultáneas del mismo recibo
 * calculan el mismo importe y siguen compartiendo clave.
 */
export function claveCheckoutRecibo(
  reciboId: string,
  metodosPedidos: readonly string[],
  importeCentimos: number,
  ahoraMs: number = Date.now(),
): string {
  // ⚠️ Auditoría 2026-09-24 (D-3): el arreglo de PAY-3 es correcto para el
  // PRIMER cambio de importe, pero la clave era PERMANENTE y el bucle vuelve a
  // cerrarse una vuelta más allá: recibo a 50 € → sesión con clave `…-5000` →
  // el panel lo corrige a 80 € → `expirar-y-crear`, clave `…-8000` → alguien
  // deshace la corrección y vuelve a 50 € → se pide la sesión con la clave
  // `…-5000` YA USADA y Stripe, dentro de su ventana de ~24 h, devuelve la
  // respuesta cacheada: la URL de la sesión que se EXPIRÓ en el paso 2. La
  // socia recibe un enlace muerto y `recibos.checkout_session_id` queda
  // apuntando a una sesión expirada. La clave identificaba el intento pero no
  // el MOMENTO. La ventana de un minuto es el mismo criterio que ya usan las
  // otras dos claves del repo (`billing-checkout-…`) y sigue cubriendo el caso
  // que motivó la clave —doble pestaña, doble clic— porque dos peticiones
  // simultáneas caen en el mismo minuto.
  const ventana = Math.floor(ahoraMs / 60000);
  return `checkout-${reciboId}-${[...metodosPedidos].sort().join('-')}-${importeCentimos}-${ventana}`;
}
