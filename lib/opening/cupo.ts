import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';

// Cupo EXACTO de las etapas «Cerrar la venta» (migr 20260922090000). La base
// decide y bloquea; esto solo envuelve las RPC y recupera plazas de cobros que
// Stripe confirma que ya no van a ocurrir.

export class EtapaAgotadaError extends Error {
  constructor() { super('ETAPA_AGOTADA'); this.name = 'EtapaAgotadaError'; }
}

export const MENSAJE_ETAPA_AGOTADA = 'Las plazas de esta oferta se han agotado.';

export function esEtapaAgotada(e: unknown): boolean {
  if (e instanceof EtapaAgotadaError) return true;
  const msg = (e as { message?: unknown } | null)?.message;
  return typeof msg === 'string' && msg.includes('ETAPA_AGOTADA');
}

/** Minutos que dura una reserva. Stripe exige ≥ 30 min para `expires_at` de una sesión. */
export const MINUTOS_RESERVA = 31;

export interface PlazaReservada { id: string; expiraEn: string }

/**
 * Reserva una plaza antes de crear el cobro. null = el plan no tiene cupo
 * exacto ahora (se vende sin reserva). Lanza EtapaAgotadaError si no queda.
 * El mismo `clave` (el mismo intento) devuelve la misma plaza y su misma
 * caducidad: con idempotencia de Stripe, los parámetros del reintento tienen
 * que ser idénticos.
 */
export async function reservarPlazaEtapa(
  admin: SupabaseClient, planId: string, studioId: string, clave: string, ahora = new Date(),
): Promise<PlazaReservada | null> {
  const expira = new Date(ahora.getTime() + MINUTOS_RESERVA * 60_000).toISOString();
  const { data, error } = await admin.rpc('reservar_plaza_etapa', {
    p_plan_id: planId, p_studio_id: studioId, p_clave: clave, p_expira_en: expira,
  });
  if (error) {
    if (esEtapaAgotada(error)) throw new EtapaAgotadaError();
    throw error;
  }
  if (!data) return null;
  const { data: plaza, error: e2 } = await admin.from('launch_stage_plazas')
    .select('id, expira_en').eq('id', data as string).single();
  if (e2) throw e2;
  return { id: plaza.id as string, expiraEn: (plaza.expira_en as string | null) ?? expira };
}

/** Guarda la referencia del cobro (cs_/pi_). false = no se pudo: hay que deshacer el cobro. */
export async function asignarRefPlaza(admin: SupabaseClient, plazaId: string, ref: string): Promise<boolean> {
  const { data, error } = await admin.rpc('asignar_ref_plaza_etapa', { p_plaza_id: plazaId, p_ref: ref });
  if (error) { console.error('[opening:cupo] asignar ref', error); return false; }
  return data === true;
}

export async function liberarPlaza(admin: SupabaseClient, plazaId: string): Promise<void> {
  const { error } = await admin.rpc('liberar_plaza_etapa', { p_plaza_id: plazaId });
  if (error) console.error('[opening:cupo] liberar', plazaId, error);
}

/** Tras `checkout.session.expired`/PaymentIntent cancelado. Solo suelta lo RESERVADO. */
export async function liberarPlazaPorRef(admin: SupabaseClient, ref: string): Promise<void> {
  const { error } = await admin.rpc('liberar_plaza_etapa_por_ref', { p_ref: ref });
  if (error) console.error('[opening:cupo] liberar por ref', ref, error);
}

/**
 * Al entregar un plan pagado, ANTES de insertar la suscripción. Nunca bloquea
 * la entrega: el dinero ya entró; si esto falla, el trigger de suscripciones
 * toma la plaza igual.
 */
export async function confirmarPlazaPorRef(admin: SupabaseClient, ref: string, suscripcionId: string): Promise<void> {
  try {
    const { error } = await admin.rpc('confirmar_plaza_etapa_por_ref', { p_ref: ref, p_suscripcion_id: suscripcionId });
    if (error) console.error('[opening:cupo] confirmar', ref, error);
  } catch (e) {
    console.error('[opening:cupo] confirmar', ref, e instanceof Error ? e.message : e);
  }
}

const PI_CANCELABLE = new Set(['requires_payment_method', 'requires_confirmation', 'requires_action']);

/**
 * Plazas RESERVADAS cuyo plazo pasó: se pregunta a Stripe y solo se sueltan si
 * el cobro ya no puede ocurrir (sesión caducada o expirada ahora, PaymentIntent
 * cancelado). Un pago completado o en proceso (SEPA/Bizum) conserva su plaza.
 * Se llama antes de reservar, así que una plaza abandonada vuelve a la venta
 * en cuanto alguien más intenta comprar — sin cron.
 */
export async function recuperarPlazasCaducadas(
  admin: SupabaseClient, stripe: Stripe, planId: string, studioId: string, stripeAccount: string, ahora = new Date(),
): Promise<number> {
  const { data: etapas, error: e1 } = await admin.from('launch_stages')
    .select('id').eq('studio_id', studioId).eq('plan_id', planId).eq('al_completar', 'CERRAR');
  if (e1 || !etapas?.length) return 0;
  const { data: plazas, error: e2 } = await admin.from('launch_stage_plazas')
    .select('id, stripe_ref').in('stage_id', etapas.map(e => e.id as string))
    .eq('estado', 'RESERVADA').lt('expira_en', ahora.toISOString()).limit(20);
  if (e2 || !plazas?.length) return 0;

  let liberadas = 0;
  for (const p of plazas) {
    const ref = p.stripe_ref as string | null;
    try {
      let suelta = false;
      if (!ref) {
        // Reservada y el cobro nunca llegó a crearse (o no se pudo guardar su ref).
        suelta = true;
      } else if (ref.startsWith('cs_')) {
        const s = await stripe.checkout.sessions.retrieve(ref, undefined, { stripeAccount });
        if (s.status === 'expired') suelta = true;
        else if (s.status === 'open') {
          await stripe.checkout.sessions.expire(ref, undefined, { stripeAccount, idempotencyKey: `plaza-expirar-${ref}` });
          suelta = true;
        }
      } else if (ref.startsWith('pos:')) {
        // TPV: la plaza vuelve si la venta se anuló o nunca llegó a registrarse.
        const clave = claveDeRefPOS(ref);
        const { data: venta } = await admin.from('ventas_pos').select('estado')
          .eq('studio_id', studioId).eq('idempotencia_clave', clave).maybeSingle();
        suelta = !venta || venta.estado === 'ANULADA';
      } else if (ref.startsWith('pi_')) {
        const pi = await stripe.paymentIntents.retrieve(ref, undefined, { stripeAccount });
        if (pi.status === 'canceled') suelta = true;
        else if (PI_CANCELABLE.has(pi.status)) {
          const c = await stripe.paymentIntents.cancel(ref, undefined, { stripeAccount, idempotencyKey: `plaza-cancelar-${ref}` });
          suelta = c.status === 'canceled';
        }
      }
      if (suelta) {
        await liberarPlaza(admin, p.id as string);
        liberadas++;
      }
    } catch (e) {
      // Si Stripe no contesta, la plaza se queda reservada: mejor no vender
      // que vender una de más.
      console.error('[opening:cupo] recuperar plaza', p.id, e instanceof Error ? e.message : e);
    }
  }
  return liberadas;
}

// ── TPV ────────────────────────────────────────────────────────────────────
// La venta se identifica por su clave de idempotencia (un reintento del TPV
// trae un id de venta nuevo, pero la base devuelve la venta original). Cada
// línea de plan con cupo reserva una plaza con ref `pos:<clave>:<plan>:<n>`.

export const refPlazaPOS = (clave: string, planId: string, n: number) => `pos:${clave}:${planId}:${n}`;

export function claveDeRefPOS(ref: string): string {
  const sinPrefijo = ref.slice('pos:'.length);
  const sinN = sinPrefijo.slice(0, sinPrefijo.lastIndexOf(':'));
  return sinN.slice(0, sinN.lastIndexOf(':'));
}

/**
 * Reserva una plaza por cada línea de plan antes de registrar la venta. Si
 * alguna etapa está llena, suelta las que ya reservó y lanza EtapaAgotadaError.
 * Devuelve los ids reservados (vacío si ningún plan tiene cupo).
 */
export async function reservarPlazasPOS(
  admin: SupabaseClient, studioId: string, clave: string, planIds: string[],
): Promise<string[]> {
  const reservadas: string[] = [];
  const vistos = new Map<string, number>();
  try {
    for (const planId of planIds) {
      const n = vistos.get(planId) ?? 0;
      vistos.set(planId, n + 1);
      const ref = refPlazaPOS(clave, planId, n);
      const plaza = await reservarPlazaEtapa(admin, planId, studioId, ref);
      if (!plaza) continue;
      reservadas.push(plaza.id);
      if (!(await asignarRefPlaza(admin, plaza.id, ref))) throw new Error('No se pudo ligar la plaza a la venta');
    }
    return reservadas;
  } catch (e) {
    for (const id of reservadas) await liberarPlaza(admin, id);
    throw e;
  }
}

/** Al entregar una línea de plan del TPV: pasa a VENDIDA una de sus plazas reservadas. */
export async function confirmarPlazaPOS(
  admin: SupabaseClient, clave: string, planId: string, suscripcionId: string,
): Promise<void> {
  // Nunca bloquea la entrega: la venta ya está cobrada (si falla, el trigger
  // de suscripciones toma plaza igual).
  try {
    const refs = Array.from({ length: 20 }, (_, n) => refPlazaPOS(clave, planId, n));
    const { data, error } = await admin.from('launch_stage_plazas').select('stripe_ref')
      .in('stripe_ref', refs).eq('estado', 'RESERVADA').order('stripe_ref').limit(1);
    if (error) { console.error('[opening:cupo] plaza POS', error); return; }
    if (data?.[0]) await confirmarPlazaPorRef(admin, data[0].stripe_ref as string, suscripcionId);
  } catch (e) {
    console.error('[opening:cupo] plaza POS', e instanceof Error ? e.message : e);
  }
}
