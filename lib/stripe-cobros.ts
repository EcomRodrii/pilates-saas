import Stripe from 'stripe';
import { supabase } from '@/lib/supabase';
import { dbUpdateRecibo } from '@/lib/supabase-data';

// Lógica de cobro off-session extraída de app/api/stripe/charge-off-session
// (DECISION-OS-ARQUITECTURA.md §12, punto 7 — el único refactor del proyecto).
// La reutiliza esa ruta (aprobación desde Automatizaciones) y el ejecutor F3
// del Decision OS (aprobación de una Recomendacion tipo RECUPERAR_PAGOS), con
// idempotencyKey de Stripe: un reintento del step de Inngest tras un fallo de
// red nunca duplica el cargo.

export type CobroErrorCode = 'NO_CONFIGURADO' | 'NO_ENCONTRADO' | 'NO_PENDIENTE' | 'SIN_TARJETA' | 'SIN_STRIPE_CONECTADO' | 'FALLO_COBRO';

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
  idempotencyKey: string;
}): Promise<ResultadoCobro> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key.startsWith('sk_test_XXXX')) {
    return { ok: false, error: 'Stripe no configurado', errorCode: 'NO_CONFIGURADO' };
  }
  const stripe = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });

  const [{ data: recibo, error: reciboError }, { data: socio, error: socioError }, { data: studio, error: studioError }] = await Promise.all([
    supabase.from('recibos').select('*').eq('id', params.reciboId).single(),
    supabase.from('socios').select('*').eq('id', params.socioId).single(),
    supabase.from('studios').select('stripe_account_id').eq('id', params.studioId).single(),
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

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(recibo.importe * 100),
      currency: 'eur',
      customer: socio.stripe_customer_id,
      payment_method: socio.stripe_payment_method_id,
      off_session: true,
      confirm: true,
      metadata: { reciboId: params.reciboId, socioId: params.socioId },
    }, { stripeAccount: studio.stripe_account_id, idempotencyKey: params.idempotencyKey });

    if (paymentIntent.status === 'succeeded') {
      await dbUpdateRecibo(params.reciboId, { estado: 'COBRADO', fechaCobro: new Date().toISOString() });
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
