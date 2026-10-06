// Qué hacer cuando se pide un checkout de un recibo que YA tiene una sesión de
// Stripe guardada. Vive aquí y no dentro de app/api/stripe/checkout porque el
// runner de tests de este repo solo mira `lib/**` (`npm test`), así que la
// lógica que se deja en una ruta no la ejercita nadie.

/**
 * `ya-pagada`: la sesión guardada ya se COMPLETÓ, pero el recibo sigue sin
 * constar cobrado (el webhook no ha llegado, o lo rechazó). El dinero ya entró
 * por esa sesión: abrir otra sería cobrarlo dos veces. Hasta el 5-oct-2026 se
 * creaba otra (`crear`). Mismo criterio que el mostrador
 * (`cerrarPagoOnlineAntesDeCobrarAMano`: pagada → no se cobra).
 */
export type DecisionCheckout = 'crear' | 'reutilizar' | 'expirar-y-crear' | 'ya-pagada';

/** Cómo se enseña la sesión: página de Stripe (enlace) o incrustada en la app. */
export type ModoCheckout = 'hospedado' | 'incrustado';

/**
 * Quién pide el pago, para decidir si puede heredar la sesión abierta de otro.
 * `pagadorVerificado` = hay sesión de usuario y resuelve a la TITULAR del recibo
 * (PAY-3): solo entonces la sesión lleva `metadata.pagadorVerificado` y el
 * webhook guarda la tarjeta de quien paga en su ficha.
 */
export interface PeticionCheckout {
  modo: ModoCheckout;
  pagadorVerificado: boolean;
}

/** `ui_mode` de Stripe → modo. Lo que no se sabe leer no se reutiliza nunca. */
export function modoDeSesion(uiMode: string | null | undefined): ModoCheckout | null {
  if (!uiMode || uiMode === 'hosted' || uiMode === 'hosted_page') return 'hospedado';
  if (uiMode === 'embedded' || uiMode === 'embedded_page') return 'incrustado';
  return null;
}

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
  /** `hosted_page`/`embedded_page`…; `null` (sesiones viejas) = hospedada. */
  ui_mode?: string | null;
  /** Lo que se le devuelve a una sesión incrustada para montarla. */
  client_secret?: string | null;
  /** `pagadorVerificado: '1'` si la abrió la titular con su sesión (PAY-3). */
  metadata?: Record<string, string> | null;
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
  peticion: PeticionCheckout,
): DecisionCheckout {
  // Ya pagada por esa sesión: ni se reutiliza ni se crea otra.
  if (previa?.status === 'complete') return 'ya-pagada';
  // Sin sesión previa, o caducada: no hay nada que reutilizar ni que expirar.
  if (!previa || previa.status !== 'open') return 'crear';
  // ⚠️ PAY-3, la mitad que faltaba: la sesión abierta solo la hereda QUIEN la
  // abrió. Una abierta por la titular con su sesión lleva
  // `pagadorVerificado`, y el webhook guarda en su ficha la tarjeta con la que
  // se pague: si se le devolvía a quien solo conoce el reciboId, la tarjeta de
  // un tercero acababa en la ficha de la titular (y al revés, una sesión anónima
  // no se le da a la titular: no guardaría su tarjeta). Y el modo tiene que
  // coincidir: una incrustada no sirve como enlace, ni al revés.
  const verificadaPrevia = previa.metadata?.pagadorVerificado === '1';
  if (verificadaPrevia !== peticion.pagadorVerificado) return 'expirar-y-crear';
  const modoPrevio = modoDeSesion(previa.ui_mode);
  if (modoPrevio !== peticion.modo) return 'expirar-y-crear';
  // Abierta pero sin con qué mandar a nadie a pagar (URL o client_secret) — y
  // sigue siendo pagable por quien ya la tenga, así que hay que expirarla, no
  // ignorarla.
  if (modoPrevio === 'hospedado' ? !previa.url : !previa.client_secret) return 'expirar-y-crear';
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
  peticion: PeticionCheckout,
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
  // El modo y la identidad (5-oct-2026) también, por lo mismo que el importe:
  // una sesión verificada y una anónima (o una hospedada y una incrustada) llevan
  // parámetros distintos, y `decidirSesionCheckout` ya no deja que una herede la
  // otra. Con la misma clave, la segunda petición del mismo minuto recibiría
  // `idempotency_error` en vez de su propia sesión.
  const quien = `${peticion.modo === 'incrustado' ? 'i' : 'h'}${peticion.pagadorVerificado ? 'v' : 'a'}`;
  return `checkout-${reciboId}-${[...metodosPedidos].sort().join('-')}-${importeCentimos}-${quien}-${ventana}`;
}

/**
 * Cuándo caduca una sesión INCRUSTADA (la de la app, RECIBOS · 6-oct-2026), en
 * segundos epoch: el inicio del minuto de la clave + 31 min. Sale del MISMO
 * minuto que `claveCheckoutRecibo`, así que dos peticiones del mismo intento
 * mandan los mismos parámetros (sin `idempotency_error`), y cumple el mínimo de
 * Stripe (30 min desde que se crea, que cae dentro de ese minuto).
 *
 * Corta a propósito (la hospedada vive 24 h): una sesión abandonada deja
 * `checkout_session_id` puesto, y mientras viva el recibo no se cobra por otra
 * vía (dunning, remesa). A los 30 min el conciliador la ve caducada y la suelta
 * (`queHacerConSesionCaducada`).
 */
export function expiraSesionIncrustada(ahoraMs: number = Date.now()): number {
  return Math.floor(ahoraMs / 60000) * 60 + 31 * 60;
}

/** La respuesta para la app: lo que monta el Checkout incrustado. */
export function respuestaIncrustada(s: { id: string; client_secret: string | null }): { clientSecret: string; checkoutSessionId: string } | null {
  return s.client_secret ? { clientSecret: s.client_secret, checkoutSessionId: s.id } : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// La REPETICIÓN idempotente de Stripe (5-oct-2026). Con la misma clave y los
// mismos parámetros, Stripe no crea otra sesión: devuelve la primera tal como era
// al CREARSE (`status: 'open'` y su URL), aunque desde entonces se haya pagado o
// haya caducado. Devolver esa URL sin mirar es mandar a pagar a una sesión muerta,
// o a una ya pagada. Se decide con la sesión de AHORA (`retrieve`).
// ─────────────────────────────────────────────────────────────────────────────

export type SesionRepetida = 'usar' | 'nueva' | 'pagada' | 'no-se-sabe';

export function queHacerConSesionRepetida(actual: { status: string | null } | null): SesionRepetida {
  if (!actual) return 'no-se-sabe';
  // Sigue abierta: es la misma, se usa (otra pestaña del mismo intento).
  if (actual.status === 'open') return 'usar';
  // Caducó: este intento necesita una sesión NUEVA, con otra clave.
  if (actual.status === 'expired') return 'nueva';
  // Completada: ya se pagó por ella. Nunca otra.
  if (actual.status === 'complete') return 'pagada';
  return 'no-se-sabe';
}

/** Clave para una sesión nueva del mismo intento cuando la de su clave ya no sirve. */
export const claveTrasSesion = (clave: string, sesionMuerta: string) => `${clave}:tras-${sesionMuerta}`;

const ID_SESION_SEGURO = /^cs_[A-Za-z0-9_]+$/;

interface ConFiltrosSesion<Q> {
  is(columna: string, valor: null): Q;
  eq(columna: string, valor: string): Q;
  in(columna: string, valores: string[]): Q;
  or(filtro: string): Q;
}

/**
 * El compare-and-set que guarda la sesión de un recibo: la guardada sigue siendo la
 * que se leyó… o ya es ESTA misma. Lo segundo pasa cuando dos peticiones del mismo
 * intento reciben de Stripe la misma sesión (la repetición idempotente): la que
 * llega segunda no puede tomarlo por «otra sesión» y caducar la que ya se entregó.
 */
export function exigirSesionLeidaOEsta<Q extends ConFiltrosSesion<Q>>(q: Q, leida: string | null, esta: string): Q {
  const seguro = ID_SESION_SEGURO.test(esta) && (leida === null || ID_SESION_SEGURO.test(leida));
  if (!seguro) return leida === null ? q.is('checkout_session_id', null) : q.eq('checkout_session_id', leida);
  if (leida === null) return q.or(`checkout_session_id.is.null,checkout_session_id.eq.${esta}`);
  return q.in('checkout_session_id', [leida, esta]);
}

/** Para quien pide pagar y no se ha podido comprobar el pago que ya tenía abierto. */
export const MENSAJE_SESION_PREVIA_SIN_COMPROBAR =
  'No hemos podido comprobar el pago que ya tenías abierto. Inténtalo en un momento: no se te ha cobrado nada.';

/** Para quien vuelve a pagar una compra (no un recibo) que ya ha pagado. */
export const MENSAJE_COMPRA_YA_PAGADA =
  'Ya has pagado esta compra: te llegará la confirmación por email. No hace falta que la pagues otra vez.';
