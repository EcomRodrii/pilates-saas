// Una sede de una cadena con suscripción viva ya la paga la CADENA: el webhook
// escribe en `cadenas` y los triggers de la migr 0066 (`heredar_plan_de_cadena`
// al crearla, `propagar_plan_cadena` después) le copian plan y estado. Lo que no
// le copian es `subscription_id`, así que una sede añadida a una cadena que ya
// paga tiene estado vivo y `subscription_id` NULL. El guard de la rama
// individual de /api/billing/checkout (`subscription_id && suscripcionActiva`)
// la dejaba pasar y abría un Checkout de plan BASE/ESTUDIO encima de la cadena:
// dos suscripciones cobrando por la misma sede. `consultarCheckoutPrevio`
// tampoco lo veía, porque pregunta a Stripe por el cliente de la SEDE y la
// suscripción vive en el de la cadena. Solo lo frenaba la UI de /suscripcion.
//
// ⚠️ No vale «tiene `cadena_id`»: el checkout de CADENA vincula la sede ANTES de
// pagar, y si se abandona, la sede no tiene más plan que el individual que
// contrate. Cuenta el estado de la cadena, con la misma lista (`ESTADOS_VIVOS`)
// con la que el webhook la da por viva.
//
// Lo mismo vale mientras el pago de la cadena está a medias, y por eso el
// checkout mira también a Stripe (el webhook tarda): nunca dos formas de pagar
// lo mismo, ni de la cadena a sus sedes ni al revés. Y el portal de facturación
// de una sede así abre el cliente de la cadena, que es el que cobra.
import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ESTADOS_VIVOS, leerPagosDelCliente, type SuscripcionPrevia } from './checkout-saas-previo.ts';
import { cancelarSuscripciones, type ResultadoCancelaciones, type PlanSueltoQueCancelaCadena } from './cancelar-suscripcion-anterior.ts';

export const MENSAJE_SEDE_INCLUIDA_EN_CADENA =
  'Esta sede ya está incluida en el plan de tu cadena, así que no necesita un plan propio.';
export const MENSAJE_PAGO_DE_CADENA_A_MEDIAS =
  'Hay un pago del plan de tu cadena a medias. Espera unos segundos y vuelve a intentarlo.';
export const MENSAJE_PAGO_DE_SEDE_A_MEDIAS =
  'Hay un pago del plan de una de tus sedes a medias. Espera unos segundos y vuelve a intentarlo.';
export const MENSAJE_SEDE_SOLO_CADENA =
  'Esta sede forma parte de tu cadena, así que se contrata con el plan Cadena, que cubre todas tus sedes en una sola suscripción. '
  + 'Founding Studio y Estudio son para un solo estudio: solo los puede contratar tu sede principal.';

export interface CadenaDeLaSede {
  estado: string | null;
  clienteStripe: string | null;
}

/** ¿La suscripción de la cadena cubre ya a sus sedes? */
export function cadenaPagaSusSedes(estadoCadena: string | null | undefined): boolean {
  return estadoCadena != null && ESTADOS_VIVOS.includes(estadoCadena);
}

/**
 * Lo que /suscripcion necesita para ofrecer planes a quien no paga (lo calcula
 * /api/billing/status).
 */
export interface OpcionesDePlan {
  /** Sede secundaria de una cadena: solo puede contratar Cadena (`decidirPlanSuelto`). */
  soloCadena: boolean;
  /** Planes sueltos que contratar Cadena cancelará: se avisa antes del botón de pagar. */
  sueltosQueCancelaCadena: PlanSueltoQueCancelaCadena[];
}

export type DecisionPlanSuelto =
  | { accion: 'seguir' }
  | { accion: 'bloquear'; motivo: 'incluida-en-cadena' | 'solo-cadena'; mensaje: string };

/**
 * ¿Puede este estudio contratar un plan SUELTO (Founding Studio, Estudio)?
 * `cadena` es la suya (null si no tiene): su estado y si esta sede es la
 * principal, la más antigua, como la elige `leerCadenaParaGratis`.
 *
 * · Un estudio suelto, sí, como siempre.
 * · Una sede de una cadena que paga, no: ya la paga la cadena.
 * · Una sede SECUNDARIA de una cadena que no paga, tampoco: se reabre
 *   contratando Cadena (decisión del fundador, 15-oct-2026). Si pudiera, una
 *   cadena de N sedes saldría por 29 € × (N−1), con la principal en el plan
 *   gratis, en vez de 149 €. Vale para contrataciones nuevas: una sede que ya
 *   paga su plan suelto sigue como está (no llega aquí: ya tiene suscripción).
 * · La sede PRINCIPAL, sí: es «un estudio», y es la que pasa al plan gratis.
 */
export function decidirPlanSuelto(cadena: { estado: string | null; esPrincipal: boolean } | null): DecisionPlanSuelto {
  if (!cadena) return { accion: 'seguir' };
  if (cadenaPagaSusSedes(cadena.estado)) return { accion: 'bloquear', motivo: 'incluida-en-cadena', mensaje: MENSAJE_SEDE_INCLUIDA_EN_CADENA };
  if (!cadena.esPrincipal) return { accion: 'bloquear', motivo: 'solo-cadena', mensaje: MENSAJE_SEDE_SOLO_CADENA };
  return { accion: 'seguir' };
}

/**
 * La cadena de una sede (null si no tiene, o si no aparece). Lanza si la lectura
 * falla: sin saberlo no se abre un Checkout que podría ser un segundo cobro.
 */
export async function leerCadenaDeLaSede(
  admin: Pick<SupabaseClient, 'from'>,
  cadenaId: string | null,
): Promise<CadenaDeLaSede | null> {
  if (!cadenaId) return null;
  const { data, error } = await admin
    .from('cadenas').select('subscription_status, stripe_customer_id').eq('id', cadenaId).maybeSingle();
  if (error) throw new Error(`leer cadena: ${error.message}`);
  const fila = data as { subscription_status: string | null; stripe_customer_id: string | null } | null;
  return fila ? { estado: fila.subscription_status, clienteStripe: fila.stripe_customer_id } : null;
}

export type DecisionIndividualEnCadena = { accion: 'bloquear' } | { accion: 'seguir'; expirar: string[] };

/**
 * Plan individual para una sede de cadena, según lo que Stripe tiene en el
 * cliente de la CADENA. Una suscripción ya viva bloquea aunque el webhook aún no
 * la haya escrito en `cadenas` (mismo criterio que PAY-5). Un Checkout de cadena
 * abierto no bloquea —puede estar abandonado, y Stripe lo deja abierto 24 h—:
 * se caduca, y gana lo último que pidió la propietaria.
 */
export function decidirIndividualEnCadena(p: {
  suscripciones: readonly SuscripcionPrevia[];
  sesionesAbiertas: readonly { id: string }[];
}): DecisionIndividualEnCadena {
  if (p.suscripciones.some(s => ESTADOS_VIVOS.includes(s.status))) return { accion: 'bloquear' };
  return { accion: 'seguir', expirar: p.sesionesAbiertas.map(s => s.id) };
}

export async function consultarCadenaAntesDeIndividual(
  stripe: Pick<Stripe, 'subscriptions' | 'checkout'>,
  clienteCadena: string,
): Promise<DecisionIndividualEnCadena> {
  return decidirIndividualEnCadena(await leerPagosDelCliente(stripe, clienteCadena));
}

/**
 * Checkouts de suscripción abiertos en los clientes de las sedes de la cadena,
 * para caducarlos antes de abrir el de la cadena. Se salta el cliente de la
 * propia cadena (las migradas en 0066 lo comparten con su sede): esos los
 * gobierna `consultarCheckoutPrevio`, que puede reutilizarlos.
 */
export async function checkoutsAbiertosDeLasSedes(
  admin: Pick<SupabaseClient, 'from'>,
  stripe: Pick<Stripe, 'subscriptions' | 'checkout'>,
  cadenaId: string,
  clienteCadena: string,
): Promise<string[]> {
  const ids: string[] = [];
  for (const cliente of await clientesDeLasSedes(admin, cadenaId, clienteCadena)) {
    const { sesionesAbiertas } = await leerPagosDelCliente(stripe, cliente);
    ids.push(...sesionesAbiertas.map(s => s.id));
  }
  return ids;
}

/** Las sedes de la cadena (id y cliente de Stripe). Lanza si la lectura falla. */
async function sedesDeLaCadena(admin: Pick<SupabaseClient, 'from'>, cadenaId: string): Promise<{ id: string; stripe_customer_id: string | null }[]> {
  const { data, error } = await admin.from('studios').select('id, stripe_customer_id').eq('cadena_id', cadenaId);
  if (error) throw new Error(`leer sedes: ${error.message}`);
  return (data ?? []) as { id: string; stripe_customer_id: string | null }[];
}

/** Los clientes de Stripe de las sedes de la cadena, cada uno una vez y sin el de la propia cadena. */
async function clientesDeLasSedes(admin: Pick<SupabaseClient, 'from'>, cadenaId: string, clienteCadena: string): Promise<string[]> {
  return clientesDistintos(await sedesDeLaCadena(admin, cadenaId), clienteCadena);
}

function clientesDistintos(sedes: readonly { stripe_customer_id: string | null }[], clienteCadena: string): string[] {
  return [...new Set(sedes.map(s => s.stripe_customer_id).filter((c): c is string => Boolean(c) && c !== clienteCadena))];
}

/**
 * Lo que una suscripción SUELTA de una sede puede estar haciendo y la de la
 * cadena viene a sustituir: cobrar (`ESTADOS_VIVOS`) o estar a medio cobrar
 * ('incomplete'). ⚠️ Cancelar la suscripción no para un cobro que ya esté en
 * vuelo (un SEPA en `processing`): si acaba cobrándose, hay que devolverlo a mano.
 */
export const ESTADOS_SUELTA_A_CANCELAR: readonly string[] = [...ESTADOS_VIVOS, 'incomplete'];

/**
 * Estados en que la cadena manda sobre sus sedes en la BD: los mismos que usa
 * `propagar_plan_cadena` (migr 20261015141653) para pisar el plan de una sede.
 * 'unpaid' no: el trigger no la pisaría, y la sede se quedaría sin plan pagado.
 */
const CADENA_MANDA_EN_SUS_SEDES: readonly string[] = ['active', 'trialing', 'past_due'];

const COMENTARIO_CANCELACION = 'Sustituida por la suscripción de su cadena (Tentare cancela el plan suelto de la sede al confirmarse Cadena).';

export interface ResultadoSueltasDeLasSedes extends ResultadoCancelaciones {
  /**
   * Suscripciones vivas en el cliente de una sede que NO son el plan suelto de
   * una sede de esta cadena (otra cadena, otro producto, sin metadata): no se
   * tocan, se avisan para revisarlas a mano.
   */
  revisar: string[];
}

/**
 * Al confirmarse la suscripción de una cadena, cancela los planes SUELTOS que
 * sigan vivos en los clientes de TODAS sus sedes (distintos del de la cadena).
 * Sin esto, contratar Cadena desde una sede secundaria dejaba cobrando el plan
 * suelto de la principal (la que pasó a Founding Studio de pago desde el gratis):
 * `cancelarSuscripcionAnterior` solo conoce la de la sede desde la que se pagó.
 *
 * · Solo con la cadena en un estado en que manda sobre sus sedes (el de
 *   `propagar_plan_cadena`): un Checkout a medias no cancela nada que funcione.
 * · Solo planes sueltos de ESTA cadena: `metadata.studioId` de una de sus sedes
 *   y sin `metadata.cadenaId`. Lo demás vivo va a `revisar`.
 * · Idempotente: se pregunta a Stripe en cada evento, y lo ya cancelado no sale.
 * · Nunca la de la propia cadena, aunque estuviera en un cliente de una sede.
 * · Un cliente que no se puede leer no frena a los demás: va a `errores`.
 * Lanza solo si no puede leer las sedes.
 */
export async function cancelarSueltasDeLasSedes(
  admin: Pick<SupabaseClient, 'from'>,
  stripe: Pick<Stripe, 'subscriptions'>,
  cadena: { id: string; clienteStripe: string; suscripcion: { id: string; status: string } },
): Promise<ResultadoSueltasDeLasSedes> {
  if (!CADENA_MANDA_EN_SUS_SEDES.includes(cadena.suscripcion.status)) return { canceladas: [], errores: [], revisar: [] };
  const sedes = await sedesDeLaCadena(admin, cadena.id);
  const idsSedes = new Set(sedes.map(s => s.id));
  const sueltas: string[] = [];
  const revisar: string[] = [];
  const errores: ResultadoCancelaciones['errores'] = [];
  for (const cliente of clientesDistintos(sedes, cadena.clienteStripe)) {
    let subs: { id: string; status: string; metadata?: Record<string, string> | null }[];
    try {
      // Hasta 100: con `limit` 20, unos cuantos 3DS abandonados podían esconder una viva más antigua.
      subs = (await stripe.subscriptions.list({ customer: cliente, status: 'all', limit: 100 })).data;
    } catch (error) {
      errores.push({ id: cliente, error });
      continue;
    }
    for (const s of subs) {
      if (s.id === cadena.suscripcion.id || !ESTADOS_SUELTA_A_CANCELAR.includes(s.status)) continue;
      const deUnaSede = !s.metadata?.cadenaId && !!s.metadata?.studioId && idsSedes.has(s.metadata.studioId);
      (deUnaSede ? sueltas : revisar).push(s.id);
    }
  }
  const r = await cancelarSuscripciones(stripe, sueltas, { comentario: COMENTARIO_CANCELACION });
  return { canceladas: r.canceladas, errores: [...errores, ...r.errores], revisar };
}

/**
 * Caduca los Checkout dados. `false` si alguno no se pudo: lo normal es que se
 * acabe de pagar, y entonces no se abre otra forma de pagar lo mismo.
 */
export async function caducarCheckouts(stripe: Pick<Stripe, 'checkout'>, ids: readonly string[]): Promise<boolean> {
  for (const id of ids) {
    try {
      await stripe.checkout.sessions.expire(id);
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * Cliente de Stripe con el que abrir el portal de facturación de una sede. Si su
 * cadena paga, el de la cadena: la sede puede conservar el cliente de un plan
 * individual anterior (el checkout de CADENA crea otro), y su portal enseñaría
 * esa suscripción cancelada en vez de la que cobra.
 */
export function clienteDelPortal(clienteSede: string | null, cadena: CadenaDeLaSede | null): string | null {
  if (cadena?.clienteStripe && cadenaPagaSusSedes(cadena.estado)) return cadena.clienteStripe;
  return clienteSede ?? cadena?.clienteStripe ?? null;
}
