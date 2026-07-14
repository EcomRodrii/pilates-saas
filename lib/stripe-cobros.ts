import Stripe from 'stripe';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { applicationFeeAmount } from '@/lib/stripe-fees';

// A-1: esta función corre SIEMPRE en servidor (ruta charge-off-session y
// ejecutor de Inngest) sin sesión de usuario. Con el cliente anónimo, RLS
// denegaba las lecturas de recibos/socios y la escritura del recibo (no hay
// política anon en esas tablas) → el cobro "no encontraba" el recibo y fallaba
// en silencio. Se usa el cliente service-role, que es lo correcto aquí.

// Lógica de cobro off-session extraída de app/api/stripe/charge-off-session
// (DECISION-OS-ARQUITECTURA.md §12, punto 7 — el único refactor del proyecto).
// La reutiliza esa ruta (aprobación desde Automatizaciones) y el ejecutor F3
// del Decision OS (aprobación de una Recomendacion tipo RECUPERAR_PAGOS), con
// idempotencyKey de Stripe: un reintento del step de Inngest tras un fallo de
// red nunca duplica el cargo.

export type CobroErrorCode = 'NO_CONFIGURADO' | 'NO_ENCONTRADO' | 'NO_PENDIENTE' | 'SIN_TARJETA' | 'SIN_STRIPE_CONECTADO' | 'CUENTA_NO_LISTA' | 'FALLO_COBRO';

export interface ResultadoCobro {
  ok: boolean;
  status?: string;
  error?: string;
  errorCode?: CobroErrorCode;
  importe?: number;
}

export async function cobrarReciboOffSession(params: {
  reciboId: string;
  socioId: string;
  studioId: string;
}): Promise<ResultadoCobro> {
  // A-10: la Idempotency-Key de Stripe se deriva SOLO del reciboId. Antes cada
  // disparador pasaba una clave distinta (la ruta manual usaba el logId; el
  // ejecutor del Decision OS usaba `${recomendacion.id}-${reciboId}`), así que si
  // ambos aprobaban el cobro del MISMO recibo casi a la vez —antes de que el
  // primero marcara el recibo COBRADO— Stripe no los deduplicaba y la socia
  // pagaba dos veces. Con la clave anclada al recibo, un segundo intento del
  // mismo cobro devuelve el mismo PaymentIntent en lugar de crear otro cargo.
  const idempotencyKey = `offsession-cobro-${params.reciboId}`;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key.startsWith('sk_test_XXXX')) {
    return { ok: false, error: 'Stripe no configurado', errorCode: 'NO_CONFIGURADO' };
  }
  const stripe = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });

  const admin = getSupabaseAdmin();
  if (!admin) {
    return { ok: false, error: 'Servicio no configurado (service role)', errorCode: 'NO_CONFIGURADO' };
  }

  const [{ data: recibo, error: reciboError }, { data: socio, error: socioError }, { data: studio, error: studioError }] = await Promise.all([
    admin.from('recibos').select('*').eq('id', params.reciboId).single(),
    admin.from('socios').select('*').eq('id', params.socioId).single(),
    admin.from('studios').select('stripe_account_id').eq('id', params.studioId).single(),
  ]);

  if (reciboError || !recibo) {
    return { ok: false, error: 'Recibo no encontrado', errorCode: 'NO_ENCONTRADO' };
  }
  if (recibo.estado !== 'PENDIENTE') {
    return { ok: false, error: 'Este recibo ya no está pendiente', errorCode: 'NO_PENDIENTE' };
  }
  if (socioError || !socio?.stripe_customer_id || !socio?.stripe_payment_method_id) {
    return { ok: false, error: 'La socia no tiene tarjeta guardada', errorCode: 'SIN_TARJETA' };
  }
  if (studioError || !studio?.stripe_account_id) {
    return { ok: false, error: 'El estudio no tiene Stripe conectado', errorCode: 'SIN_STRIPE_CONECTADO' };
  }

  // Verifica que la cuenta conectada del estudio PUEDE cobrar antes de intentarlo.
  // Si el onboarding de Stripe está a medias (charges_enabled=false) o la cuenta
  // se desconectó, el cargo fallaría con un error críptico; mejor avisar claro.
  try {
    const cuenta = await stripe.accounts.retrieve(studio.stripe_account_id);
    if (!cuenta.charges_enabled) {
      return {
        ok: false, errorCode: 'CUENTA_NO_LISTA',
        error: 'La cuenta de Stripe del estudio aún no puede cobrar. Completa el onboarding en Stripe (verificación de identidad y cuenta bancaria).',
      };
    }
  } catch {
    return { ok: false, error: 'No se pudo verificar la cuenta de Stripe del estudio (¿desconectada?).', errorCode: 'CUENTA_NO_LISTA' };
  }

  try {
    const amountCents = Math.round(recibo.importe * 100);
    // R2: take-rate de plataforma (apagado por defecto; ver lib/stripe-fees.ts).
    const fee = applicationFeeAmount(amountCents);
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'eur',
      customer: socio.stripe_customer_id,
      payment_method: socio.stripe_payment_method_id,
      off_session: true,
      confirm: true,
      metadata: { reciboId: params.reciboId, socioId: params.socioId },
      ...(fee !== undefined ? { application_fee_amount: fee } : {}),
    }, { stripeAccount: studio.stripe_account_id, idempotencyKey });

    if (paymentIntent.status === 'succeeded') {
      await admin.from('recibos').update({ estado: 'COBRADO', fecha_cobro: new Date().toISOString() }).eq('id', params.reciboId);
      return { ok: true, status: paymentIntent.status, importe: recibo.importe };
    }

    // requires_action u otro estado no terminal: la tarjeta necesita
    // autenticación (3DS) que no se puede completar sin la socia presente.
    return {
      ok: false, status: paymentIntent.status, errorCode: 'FALLO_COBRO',
      error: 'El banco pidió autenticación adicional (3DS) que no se puede completar sin la socia presente. Pídele que pague desde un enlace de cobro normal.',
    };
  } catch (err) {
    const mensaje = err instanceof Stripe.errors.StripeError
      ? err.message
      : (err instanceof Error ? err.message : 'Error desconocido al cobrar');
    return { ok: false, error: mensaje, errorCode: 'FALLO_COBRO' };
  }
}
