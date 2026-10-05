// Review Boost en el checkout del SaaS: la recompensa pendiente (feedback interno
// 4-5★, ver app/api/growth/review-boost/feedback/route.ts) se aplica como 20 %
// al Checkout sin que el estudio teclee ningún código.
//
// Se canjea JUSTO antes de crear la sesión de Stripe que la lleva, no al entrar
// en /api/billing/checkout: antes se canjeaba lo primero, y cualquier salida
// posterior sin sesión —un 409 de «ya tienes una suscripción», un Checkout
// abierto reutilizado, un fallo de Stripe— la gastaba sin que el estudio la
// hubiera visto. Y si Stripe falla al crear la sesión, se devuelve.
//
// Límite conocido y aceptado (documentado en el plan): un checkout abandonado
// deja la recompensa "canjeada" sin que el estudio haya pagado — bajo impacto
// (20 % de un mes), no justifica una reserva con TTL.
import type { SupabaseClient } from '@supabase/supabase-js';

export interface RecompensaPendiente {
  id: string;
  cupon: string;
}

/** La recompensa sin canjear del estudio. Un fallo de lectura cuenta como «no hay»: no mueve dinero. */
export async function leerRecompensaPendiente(
  admin: Pick<SupabaseClient, 'from'>,
  studioId: string,
): Promise<RecompensaPendiente | null> {
  const { data } = await admin
    .from('review_boost_recompensas')
    .select('id, stripe_coupon_id')
    .eq('studio_id', studioId).is('canjeada_en', null).maybeSingle();
  const fila = data as { id: string; stripe_coupon_id: string | null } | null;
  return fila?.stripe_coupon_id ? { id: fila.id, cupon: fila.stripe_coupon_id } : null;
}

/**
 * Compare-and-set: devuelve la marca de canje si esta petición se la ha quedado,
 * o null si otra ya la había canjeado (y entonces se sigue sin descuento).
 */
export async function canjearRecompensa(
  admin: Pick<SupabaseClient, 'from'>,
  recompensa: RecompensaPendiente,
  ahora: Date = new Date(),
): Promise<string | null> {
  const canjeadaEn = ahora.toISOString();
  const { data } = await admin
    .from('review_boost_recompensas')
    .update({ canjeada_en: canjeadaEn })
    .eq('id', recompensa.id).is('canjeada_en', null).select('id').maybeSingle();
  return data ? canjeadaEn : null;
}

/**
 * Deshace un canje cuyo Checkout no llegó a crearse. Solo si sigue siendo ESTE
 * canje (misma marca), y best-effort: si falla, queda como el límite aceptado
 * de arriba.
 */
export async function devolverRecompensa(
  admin: Pick<SupabaseClient, 'from'>,
  recompensa: RecompensaPendiente,
  canjeadaEn: string,
): Promise<void> {
  try {
    await admin
      .from('review_boost_recompensas')
      .update({ canjeada_en: null })
      .eq('id', recompensa.id).eq('canjeada_en', canjeadaEn);
  } catch {
    /* no-op */
  }
}
