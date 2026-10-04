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

export const MENSAJE_SEDE_INCLUIDA_EN_CADENA =
  'Esta sede ya está incluida en el plan de tu cadena, así que no necesita un plan propio.';
export const MENSAJE_PAGO_DE_CADENA_A_MEDIAS =
  'Hay un pago del plan de tu cadena a medias. Espera unos segundos y vuelve a intentarlo.';
export const MENSAJE_PAGO_DE_SEDE_A_MEDIAS =
  'Hay un pago del plan de una de tus sedes a medias. Espera unos segundos y vuelve a intentarlo.';

export interface CadenaDeLaSede {
  estado: string | null;
  clienteStripe: string | null;
}

/** ¿La suscripción de la cadena cubre ya a sus sedes? */
export function cadenaPagaSusSedes(estadoCadena: string | null | undefined): boolean {
  return estadoCadena != null && ESTADOS_VIVOS.includes(estadoCadena);
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
  const { data, error } = await admin.from('studios').select('stripe_customer_id').eq('cadena_id', cadenaId);
  if (error) throw new Error(`leer sedes: ${error.message}`);
  const clientes = [...new Set(
    ((data ?? []) as { stripe_customer_id: string | null }[])
      .map(s => s.stripe_customer_id)
      .filter((c): c is string => Boolean(c) && c !== clienteCadena),
  )];
  const ids: string[] = [];
  for (const cliente of clientes) {
    const { sesionesAbiertas } = await leerPagosDelCliente(stripe, cliente);
    ids.push(...sesionesAbiertas.map(s => s.id));
  }
  return ids;
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
