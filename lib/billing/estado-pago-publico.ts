// P1-3 (estados/confirmación real de reserva): lógica PURA del endpoint
// público `/api/public/estado-pago` y de su polling en el paso 'done' de
// /reservar/[slug]. Sin imports de servidor a propósito — la comparte el
// cliente (derivar el PaymentIntent del clientSecret, cadencia del polling)
// y la route (resolver el estado a partir de las filas que dejó el webhook).
//
// Contexto: en «pagar y reservar sin login» (Modo A) la RESERVA la crea el
// WEBHOOK después de confirmar el PaymentIntent (reservarPlazaTrasPagoPublico,
// best-effort). La pantalla 'done' antes solo podía decir «estamos
// confirmando» para siempre; con esto pregunta al servidor hasta tener la
// respuesta real.

export type EstadoPagoPublico =
  | 'en_proceso'
  | 'confirmada'
  | 'lista_espera'
  | 'pendiente_aprobacion'
  // La socia YA tenía una reserva viva en esa clase (con su bono, de otro pago…):
  // este pago no la ha reservado otra vez y queda a su favor. `previa` dice qué
  // tenía. Antes salía «fallida» («no hemos podido asignarte la plaza») a quien
  // SÍ tenía plaza.
  | 'ya_tenia_plaza'
  | 'fallida';

export type ReservaPrevia = 'confirmada' | 'lista_espera' | 'pendiente_aprobacion';

export interface RespuestaEstadoPago {
  estado: EstadoPagoPublico;
  clase?: { nombre: string; inicio: string };
  /** Solo con `ya_tenia_plaza`: lo que ya tenía en la clase. */
  previa?: ReservaPrevia;
  /**
   * Solo con la sesión de la socia (Bearer): lo que este pago le ha entregado.
   * Existe en cuanto el servidor ha creado la suscripción `sus-web-…` del pago,
   * o sea cuando el bono YA está en su cuenta — no cuando Stripe dice que cobró.
   * Es lo único que deja a la app decir «tu bono está activo» (P01).
   */
  compra?: CompraEntregada;
}

/** Lo que entregó el pago, leído de la suscripción que creó el servidor. */
export interface CompraEntregada {
  entregada: true;
  /** Nombre del plan comprado. */
  plan: string;
  /** Sesiones que le quedan; `null` = ilimitado (una cuota). */
  sesionesRestantes: number | null;
  /** Hasta cuándo vale (YYYY-MM-DD), si caduca. */
  fechaFin: string | null;
}

/**
 * La suscripción que creó la entrega, traducida. `null` si todavía no existe
 * (el webhook no ha llegado) o no es una suscripción viva: un bono cancelado
 * (reembolso) no se anuncia como «activo».
 */
export function compraDeSuscripcion(
  sus: { estado?: string | null; sesiones_restantes?: number | null; fecha_fin?: string | null } | null | undefined,
  nombrePlan: string | null | undefined,
): CompraEntregada | null {
  if (!sus || sus.estado !== 'ACTIVA') return null;
  return {
    entregada: true,
    plan: nombrePlan?.trim() || 'Tu bono',
    sesionesRestantes: typeof sus.sesiones_restantes === 'number' ? sus.sesiones_restantes : null,
    fechaFin: sus.fecha_fin ?? null,
  };
}

/**
 * Cómo se identifica quien pregunta. Con cabecera `Authorization` es la app de
 * la alumna y se la identifica SOLO por su sesión: un Bearer que no vale nunca
 * cae a la comprobación por email (sería una puerta trasera: quien conoce el pi
 * y el email de otra preguntaría como invitada). Sin cabecera, el modo email de
 * siempre (/reservar sin cuenta).
 */
export function modoDeIdentidad(authorization: string | null | undefined): 'sesion' | 'email' {
  return authorization && authorization.trim() ? 'sesion' : 'email';
}

// El cliente guarda el clientSecret (`pi_xxx_secret_yyy`); el id del
// PaymentIntent es la parte anterior a `_secret_`. Los ids de test llevan
// `pi_3Abc..._secret_...` — alfanumérico tras el prefijo, sin más guiones
// bajos antes del separador.
export function piDeClientSecret(clientSecret: string | null | undefined): string | null {
  if (!clientSecret) return null;
  const m = /^(pi_[A-Za-z0-9]+)_secret_/.exec(clientSecret);
  return m?.[1] ?? null;
}

// Guardia de identidad del endpoint: el email que teclea quien pregunta debe
// coincidir con el de la ficha que el webhook creó/reutilizó. Comparación
// insensible a mayúsculas y espacios (mismo criterio que el `ilike` con el
// que entregarPlanComprado busca la ficha). Dos vacíos NUNCA coinciden — un
// recibo cuya ficha quedara sin email no puede consultarse con `email=`.
export function emailsCoinciden(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = (a ?? '').trim().toLowerCase();
  const nb = (b ?? '').trim().toLowerCase();
  return na.length > 0 && na === nb;
}

// Traduce lo que hay en BD al estado público. `estadoReserva` es
// `reservas.estado` si la fila `res-web-…` existe; `avisoSinPlaza` es si el
// webhook dejó la notificación RESERVA_PAGADA_SIN_PLAZA al mostrador (la
// única traza consultable de «cobré pero no pude reservar» — best-effort,
// ver la route). Cualquier estado de reserva no contemplado (p. ej. una
// CANCELADA inmediata, que aquí no debería darse) responde 'en_proceso':
// mejor que el copy de «tardando» cubra un caso rarísimo que inventar una
// confirmación o un fallo que no consta.
export function resolverEstadoPago(
  estadoReserva: string | null | undefined,
  avisoSinPlaza: boolean,
): EstadoPagoPublico {
  if (estadoReserva === 'CONFIRMADA') return 'confirmada';
  if (estadoReserva === 'LISTA_ESPERA') return 'lista_espera';
  if (estadoReserva === 'PENDIENTE_APROBACION') return 'pendiente_aprobacion';
  if (!estadoReserva && avisoSinPlaza) return 'fallida';
  return 'en_proceso';
}

// Cadencia del polling del paso 'done': ~35s en total, más espaciado cuanto
// más tarda (el webhook de Stripe suele llegar en 1-5s; más allá de medio
// minuto ya no es «un momento» y se pasa al copy de «tardando»).
export const RETARDOS_POLL_MS = [1000, 2000, 3000, 5000, 8000, 8000, 8000];

// ─────────────────────────────────────────────────────────────────────────────
// El aviso de «cobrado sin plaza» que deja el servidor, leído para la socia
// (5-oct-2026). Antes se buscaba CUALQUIER aviso de esa socia desde el cobro:
// el de otro pago de la misma clase valía para este. Ahora se elige el de ESTE
// pago (`data.paymentIntentId`). Uno LEGADO (de antes de este cambio: sin
// `situacionCodigo` ni pago anotado) sigue valiendo como antes; uno nuevo sin pago
// (no se supo cuál era) no vale para ninguno: un «en-espera» de la clase X no puede
// decirle «sin plaza» al pago de la clase Y, que sí la tiene.
// ─────────────────────────────────────────────────────────────────────────────

export interface AvisoSinPlaza {
  data: Record<string, unknown> | null;
  resource_id: string | null;
}

export function elegirAvisoDelPago(avisos: readonly AvisoSinPlaza[] | null | undefined, pi: string): AvisoSinPlaza | null {
  const lista = avisos ?? [];
  const delPago = lista.find(a => a.data?.paymentIntentId === pi);
  if (delPago) return delPago;
  return lista.find(a => avisoLegado(a)) ?? null;
}

/** De antes de anotar el pago: no lleva ni su situación ni su pago. */
function avisoLegado(a: AvisoSinPlaza): boolean {
  const d = a.data ?? {};
  return d.situacionCodigo === undefined && (d.paymentIntentId === undefined || d.paymentIntentId === null);
}

const SITUACIONES_YA_TENIA = new Set(['ya-tenia-reserva', 'ya-en-espera', 'ya-pendiente-aprobacion']);

/** ¿El aviso dice que ya tenía una reserva en la clase? */
export function avisoDeYaTenia(aviso: AvisoSinPlaza | null): boolean {
  const codigo = aviso?.data?.situacionCodigo;
  return typeof codigo === 'string' && SITUACIONES_YA_TENIA.has(codigo);
}

/** Lo que tiene ahora en la clase, por sus reservas vivas (plaza > pendiente > cola). */
export function reservaPreviaDe(estados: readonly (string | null)[]): ReservaPrevia | null {
  if (estados.includes('CONFIRMADA') || estados.includes('ASISTIDA')) return 'confirmada';
  if (estados.includes('PENDIENTE_APROBACION')) return 'pendiente_aprobacion';
  if (estados.includes('LISTA_ESPERA')) return 'lista_espera';
  return null;
}
