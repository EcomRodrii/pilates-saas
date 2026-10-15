// PAY-2 (62ª pasada). Cancela la suscripción individual que un alta a CADENA
// reemplaza — SOLO una vez que la de cadena ha llegado a un estado real
// (`ESTADOS_VIVOS`, la misma lista que ya usa `checkoutPrevio` para decidir
// "esto ya existe de verdad"). Antes esto se hacía síncronamente en
// /api/billing/checkout, ANTES de crear el Checkout: si la propietaria
// abandonaba la página de pago, se quedaba sin ninguna suscripción — ni la
// vieja (cancelada) ni la nueva (nunca llegó a pagarse).
//
// Se aplaza al webhook de Stripe: el id a cancelar viaja en la metadata de la
// suscripción nueva (`subscription_data.metadata.cancelarSuscripcionAnterior`,
// puesto por /api/billing/checkout). ⚠️ `studio.subscription_id` NO lo
// sobrescribe la de cadena: el trigger `propagar_plan_cadena` solo copia plan,
// estado y fin de periodo, así que la sede sigue guardando el id de la
// individual. Por eso el `deleted` de esa individual, que llega después, lo
// filtra `desplazadaPorSuCadena` (suscripcion-desplazada-por-cadena.ts) y no
// una comparación con ese campo.
import Stripe from 'stripe';
import { ESTADOS_VIVOS } from './checkout-saas-previo.ts';
import { pagaPlan } from './plan-gratis.ts';

/**
 * El plan suelto que un alta a CADENA desde esta sede tiene que cancelar cuando
 * Stripe la confirme (PAY-2), o `null`. Solo si la sede lo está pagando, lo tiene
 * a medio pagar ('incomplete') o impagado pero vivo en Stripe ('unpaid': aún
 * puede cobrarse). Un estudio en el plan gratis, o con la prueba agotada,
 * conserva el id de una suscripción ya muerta: no hay nada que cancelar (antes
 * bastaba con «no es 'canceled'», y 'gratis' lo pasaba).
 */
export function planSueltoACancelarAlPasarACadena(studio: { subscription_status: string | null; subscription_id: string | null }): string | null {
  if (!studio.subscription_id) return null;
  const vivo = pagaPlan({ subscriptionStatus: studio.subscription_status, subscriptionId: studio.subscription_id })
    || studio.subscription_status === 'incomplete' || studio.subscription_status === 'unpaid';
  return vivo ? studio.subscription_id : null;
}

/** Una sede (o el estudio suelto) con lo que hace falta para saber si Cadena le cancela un plan suelto. */
export interface SedeConPlan {
  id: string;
  nombre?: string | null;
  plan: string | null;
  subscription_status: string | null;
  subscription_id: string | null;
  current_period_end: string | null;
}

/** Un plan suelto que se cancelará al confirmarse Cadena, para avisarlo ANTES de pagar. */
export interface PlanSueltoQueCancelaCadena {
  plan: 'BASE' | 'ESTUDIO';
  /** ¿Es de OTRA sede de la cadena, y no de la que va a contratar Cadena? */
  otraSede: boolean;
  /** El nombre de esa otra sede, si lo tiene. */
  nombreSede: string | null;
  /**
   * Hasta cuándo está pagado lo que se pierde, solo si está al día ('active'):
   * se cancela sin prorrateo, así que ese tramo se paga dos veces. `null` si no
   * hay nada pagado que perder (en prueba, impagado o a medio pagar).
   */
  pagadoHasta: string | null;
  /**
   * Su primer pago aún se está procesando ('incomplete', p. ej. un adeudo SEPA):
   * cancelar la suscripción no detiene ese cobro, así que no se puede prometer
   * que deje de pagarse. La pantalla lo dice en condicional.
   */
  pagoEnCurso: boolean;
}

/**
 * Los planes sueltos que contratar Cadena cancelará (decisión del fundador,
 * 15-oct-2026: se avisa antes del botón de pagar). Son los mismos que cancela el
 * webhook al confirmarse: el de la sede desde la que se paga
 * (`planSueltoACancelarAlPasarACadena`) y el de las demás sedes de la cadena
 * (`cancelarSueltasDeLasSedes`, que vuelve a preguntar a Stripe), leídos aquí de
 * la base para no llamar a Stripe al pintar /suscripcion. `sedes` son las de la
 * cadena, o solo el estudio si aún no tiene. Primero la propia.
 *
 * Diferencias conocidas con lo que hará el webhook (revisión de tentare-stripe):
 * · Con un webhook perdido, la base puede no saber de un plan suelto que Stripe
 *   sí cancelará. Uno antiguo sin `metadata.studioId` no se cancela: va a
 *   `revisar` (aviso a Sentry).
 * · Una sede que comparta cliente de Stripe con su cadena (las migradas en la
 *   0066) no se cancela desde otra sede: `cancelarSueltasDeLasSedes` salta ese
 *   cliente. No hay cobro doble (el checkout de Cadena da 409 «Ya tienes una
 *   suscripción activa» al verla en ese mismo cliente), pero el aviso no
 *   llegaría a cumplirse. A 15-oct-2026 ninguna sede comparte cliente, y las
 *   nuevas crean siempre el suyo.
 * · El precio es el del plan (`PLAN_INFO`), sin cupones.
 */
export function sueltosQueCancelaCadena(sedes: readonly SedeConPlan[], estudioId: string): PlanSueltoQueCancelaCadena[] {
  return [...sedes]
    .sort((a, b) => Number(b.id === estudioId) - Number(a.id === estudioId))
    .filter((s): s is SedeConPlan & { plan: 'BASE' | 'ESTUDIO' } =>
      (s.plan === 'BASE' || s.plan === 'ESTUDIO') && planSueltoACancelarAlPasarACadena(s) !== null)
    .map(s => ({
      plan: s.plan,
      otraSede: s.id !== estudioId,
      nombreSede: s.id !== estudioId ? (s.nombre?.trim() || null) : null,
      pagadoHasta: s.subscription_status === 'active' ? s.current_period_end : null,
      pagoEnCurso: s.subscription_status === 'incomplete',
    }));
}

/** ¿Hay que intentar cancelar algo, y qué id? `null` = nada que hacer. */
export function idACancelar(sub: { metadata?: Record<string, string> | null; status: string }): string | null {
  const anteriorId = sub.metadata?.cancelarSuscripcionAnterior;
  if (!anteriorId || !ESTADOS_VIVOS.includes(sub.status)) return null;
  return anteriorId;
}

export interface ResultadoCancelacion {
  intentado: boolean;
  /** `undefined` = no había nada que cancelar. `null` = cancelado (o ya lo estaba). */
  errorInesperado?: unknown;
}

/**
 * Idempotente por diseño, no por estado guardado: cada evento de esta misma
 * suscripción (creada, renovada, reactivada) vuelve a intentar cancelar el
 * mismo id. Cancelar una suscripción ya cancelada es un no-op seguro
 * (`resource_missing` — mismo código que ya toleraba el `.catch()` original
 * de esta misma cancelación, auditoría de producto P0-4); solo un error
 * DISTINTO se reporta. Nunca lanza: fallar aquí no puede tirar abajo la
 * actualización de `cadenas`/`studios` que ya se aplicó antes de llamar a esto.
 */
export async function cancelarSuscripcionAnteriorSiToca(
  stripe: Pick<Stripe, 'subscriptions'>,
  sub: { metadata?: Record<string, string> | null; status: string },
): Promise<ResultadoCancelacion> {
  const anteriorId = idACancelar(sub);
  if (!anteriorId) return { intentado: false };
  const { errores } = await cancelarSuscripciones(stripe, [anteriorId]);
  return errores.length ? { intentado: true, errorInesperado: errores[0].error } : { intentado: true };
}

export interface ResultadoCancelaciones {
  /** Canceladas ahora (o que ya lo estaban: `resource_missing`). */
  canceladas: string[];
  /** Las que Stripe no dejó cancelar (o el cliente que no se pudo leer): para avisar, nunca para lanzar. */
  errores: { id: string; error: unknown }[];
}

/**
 * Cancela una lista de suscripciones, una a una y cada una una sola vez.
 * `resource_missing` cuenta como hecho (ya no existe), igual que arriba. Nunca
 * lanza: quien llama ya ha aplicado lo suyo y solo tiene que avisar.
 */
export async function cancelarSuscripciones(
  stripe: Pick<Stripe, 'subscriptions'>,
  ids: readonly string[],
  opciones: { comentario?: string } = {},
): Promise<ResultadoCancelaciones> {
  const r: ResultadoCancelaciones = { canceladas: [], errores: [] };
  // El motivo queda en Stripe (`cancellation_details.comment`): quien mire la suscripción sabe por qué se canceló.
  const params = opciones.comentario ? { cancellation_details: { comment: opciones.comentario } } : undefined;
  for (const id of new Set(ids)) {
    try {
      await (params ? stripe.subscriptions.cancel(id, params) : stripe.subscriptions.cancel(id));
      r.canceladas.push(id);
    } catch (err) {
      const code = err instanceof Stripe.errors.StripeError ? err.code : undefined;
      if (code === 'resource_missing') r.canceladas.push(id);
      else r.errores.push({ id, error: err });
    }
  }
  return r;
}
