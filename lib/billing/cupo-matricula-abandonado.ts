// ─────────────────────────────────────────────────────────────────────────────
// Cuándo vuelve la plaza de «matrícula gratis para las N primeras».
//
// Puro y sin red. Lo usan el webhook (evento a evento) y el conciliador
// (barriendo lo que Stripe tiene), que es quien de verdad la devuelve: en
// producción el endpoint no está suscrito a `checkout.session.expired` ni a
// `payment_intent.canceled` (comprobado el 21-sep-2026), así que depender solo
// de esos eventos es no devolverla nunca.
//
// ⚠️ La regla: la plaza vuelve SOLO cuando el cobro ya no puede ocurrir.
// `payment_intent.payment_failed` NO es eso: tras un rechazo el PaymentIntent
// vuelve a `requires_payment_method` y el widget deja reintentar con otra
// tarjeta sobre el MISMO PI (probado en Stripe test: failed → succeeded). Si la
// plaza se devolvía en el rechazo y el segundo intento pagaba, la socia se
// llevaba la matrícula gratis sin contar en el cupo — se regalaban más de N.
// ─────────────────────────────────────────────────────────────────────────────

const FLAG = 'cupoMatriculaReservado';

/**
 * Lo que un PaymentIntent del checkout embebido tarda en darse por
 * abandonado. Pasado esto, el conciliador lo cancela y devuelve la plaza.
 *
 * Holgado a propósito: cancelarlo con la socia todavía delante le rompe el
 * pago (el widget diría que el cobro está cancelado). Dos horas cubren de
 * sobra un 3DS o un Apple Pay lentos; y entra de lleno en la ventana de 12 h
 * que ya lista el conciliador horario, así que cada PI tiene diez pasadas.
 */
export const ABANDONO_PI_SEGUNDOS = 2 * 3600;

/** Estados en los que un PI todavía podría llegar a cobrarse. */
const PI_COBRABLE = new Set(['requires_payment_method', 'requires_confirmation', 'requires_action']);

export interface PlazaADevolver {
  /** Clave de idempotencia de la devolución (PK de `matricula_cupo_liberaciones`). */
  clave: string;
  planId: string;
}

interface SesionMin {
  id: string;
  status: string | null;
  metadata: Record<string, string> | null | undefined;
}

interface PIMin {
  id: string;
  status: string | null;
  created: number;
  metadata: Record<string, string> | null | undefined;
}

/**
 * Modo A: una Checkout Session que se llevó plaza y ya CADUCÓ.
 *
 * La clave es la SESIÓN, no su PaymentIntent: con la API actual el PI solo
 * nace cuando alguien intenta pagar, así que una sesión abandonada sin tocar
 * —el caso más común— caduca con `payment_intent: null` (probado en Stripe
 * test). Con la clave en el PI, justo ese caso nunca devolvía la plaza.
 */
export function plazaDeSesionCaducada(s: SesionMin): PlazaADevolver | null {
  if (s.status !== 'expired') return null;
  const md = s.metadata ?? {};
  if (md[FLAG] !== '1' || !md.planId) return null;
  return { clave: s.id, planId: md.planId };
}

/**
 * Modo B: un PaymentIntent del checkout embebido que ya está CANCELADO.
 *
 * Solo `plan_web_embebido`: es la única vía que pone el flag en el PI. (El PI
 * de un Modo A no lo lleva; si algún día lo llevara, la sesión y su PI
 * devolverían la misma plaza con dos claves distintas.)
 */
export function plazaDePICancelado(pi: Omit<PIMin, 'created'>): PlazaADevolver | null {
  if (pi.status !== 'canceled') return null;
  const md = pi.metadata ?? {};
  if (md.origen !== 'plan_web_embebido' || md[FLAG] !== '1' || !md.planId) return null;
  return { clave: pi.id, planId: md.planId };
}

/**
 * Modo B: PIs que se llevaron plaza, siguen cobrables y nadie ha tocado en
 * `ABANDONO_PI_SEGUNDOS`. Un PI así nunca caduca solo ni emite ningún evento,
 * así que sin cancelarlo la plaza se quedaría gastada para siempre.
 *
 * Esto solo decide a quién INTENTAR cancelar. La plaza se devuelve después,
 * y solo si Stripe confirma `canceled`: Stripe se niega a cancelar un PI que
 * ya se ha cobrado o se está cobrando, así que un pago que entre a la vez que
 * el barrido nunca se queda con la matrícula gratis y la plaza devuelta.
 */
export function pisAbandonadosConPlaza(pis: PIMin[], ahoraSeg: number): PIMin[] {
  return pis.filter(pi => {
    if (!PI_COBRABLE.has(pi.status ?? '')) return false;
    const md = pi.metadata ?? {};
    if (md.origen !== 'plan_web_embebido' || md[FLAG] !== '1' || !md.planId) return false;
    return ahoraSeg - pi.created >= ABANDONO_PI_SEGUNDOS;
  });
}
