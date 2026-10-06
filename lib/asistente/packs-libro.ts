// ─────────────────────────────────────────────────────────────────────────────
// Las DOS escrituras de `ia_packs`, y nadie más las hace: crear el pack cuando
// Stripe confirma el pago y retirarlo cuando se devuelve el dinero. Las llama
// SOLO el webhook de la plataforma (/api/billing/webhook), con service-role.
// El navegador no puede escribir la tabla (RLS + REVOKE, migr 20261005213749) y
// la página de vuelta del Checkout solo LEE.
//
// Idempotente por construcción, no por cuidado: el pack se identifica por su
// sesión de Checkout (`UNIQUE (stripe_checkout_session_id)`) y el alta es un
// `INSERT … ON CONFLICT DO NOTHING`. Stripe puede entregar el mismo pago dos
// veces (reintento, `completed` + `async_payment_succeeded`, o los dos destinos):
// sale un solo pack.
//
// Relativo y sin `@/`: se prueba con `node --test` y un cliente falso.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import { caducidadDelPack } from './packs.ts';

type Admin = Pick<SupabaseClient, 'from'>;

export interface PackAAcreditar {
  studioId: string;
  unidades: 100 | 300 | 1000;
  precioEur: number;
  sessionId: string;
  paymentIntentId: string | null;
}

export type ResultadoAcreditar = 'creado' | 'ya_estaba' | 'estudio_inexistente';

/**
 * Crea el pack de un pago confirmado. `ahora` = cuándo se confirmó el pago (la
 * hora del evento de Stripe, no la de procesarlo): de ahí sale la caducidad. Una segunda entrega del mismo pago no
 * crea otro ('ya_estaba'). Un estudio que ya no existe no tiene arreglo con
 * reintentos ('estudio_inexistente': quien llama avisa y no reintenta). Cualquier
 * otro fallo LANZA, para que Stripe vuelva a entregar el evento.
 */
export async function acreditarPack(
  admin: Admin, p: PackAAcreditar, ahora = new Date(),
  /**
   * 'REEMBOLSADO' = lápida: el reembolso llegó ANTES que el alta (o el alta no
   * llegó nunca). El pack nace retirado y un `completed` tardío choca con el
   * UNIQUE y no lo resucita.
   */
  estado: 'ACTIVO' | 'REEMBOLSADO' = 'ACTIVO',
): Promise<ResultadoAcreditar> {
  const fila = {
    studio_id: p.studioId,
    unidades: p.unidades,
    precio_eur: p.precioEur,
    comprado_en: ahora.toISOString(),
    caduca_en: caducidadDelPack(ahora).toISOString(),
    estado,
    stripe_checkout_session_id: p.sessionId,
    stripe_payment_intent_id: p.paymentIntentId,
  };
  const { data, error } = await admin.from('ia_packs')
    .upsert(fila, { onConflict: 'stripe_checkout_session_id', ignoreDuplicates: true })
    .select('id');
  if (error) {
    // 23503: la FK a studios. El estudio se borró entre pagar y confirmar.
    if (error.code === '23503') return 'estudio_inexistente';
    throw new Error(`acreditar pack: ${error.message}`);
  }
  return Array.isArray(data) && data.length > 0 ? 'creado' : 'ya_estaba';
}

export type ResultadoRetirar = 'retirado' | 'ya_retirado' | 'sin_pack';

/**
 * Retira (REEMBOLSADO) el pack pagado con este PaymentIntent. Las consultas que
 * ya se gastaron de él NO vuelven: `unidades_usadas` se queda como estaba, y
 * `ia_saldo_consultas` deja de contar lo que le quedaba. 'sin_pack' = ese pago
 * no tiene pack (todavía): quien llama decide si es de un pack y deja la lápida.
 */
export async function retirarPackPorPago(admin: Admin, paymentIntentId: string): Promise<ResultadoRetirar> {
  const { data, error } = await admin.from('ia_packs')
    .update({ estado: 'REEMBOLSADO' })
    .eq('stripe_payment_intent_id', paymentIntentId)
    .eq('estado', 'ACTIVO')
    .select('id');
  if (error) throw new Error(`retirar pack: ${error.message}`);
  if (Array.isArray(data) && data.length > 0) return 'retirado';
  const { data: ya, error: e2 } = await admin.from('ia_packs')
    .select('id').eq('stripe_payment_intent_id', paymentIntentId).maybeSingle();
  if (e2) throw new Error(`retirar pack (lectura): ${e2.message}`);
  return ya ? 'ya_retirado' : 'sin_pack';
}
