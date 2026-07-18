import Stripe from 'stripe';
import * as Sentry from '@sentry/nextjs';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { applicationFeeAmount } from '@/lib/billing/stripe-fees';
import { elegirMetodoCobro } from '@/lib/billing/metodo-cobro';

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
  // A-10 + Dunning (0041): la Idempotency-Key de Stripe se ancla al recibo Y al
  // número de intento (intentos_reintento). Anclarla SOLO al recibo evitaba el
  // doble cargo de dos aprobaciones simultáneas del MISMO cobro, pero rompía el
  // dunning: un reintento devolvía el MISMO PaymentIntent ya fallido en lugar de
  // intentar de nuevo. Con `-i${intento}` cada reintento es un cargo nuevo, y dos
  // disparadores del mismo intento siguen deduplicados. Se calcula más abajo, tras
  // cargar el recibo (necesita su intentos_reintento).
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
  // Se puede cobrar un recibo PENDIENTE o uno FALLIDO (recuperación manual tras
  // agotar el dunning: si la socia paga más adelante, se vuelve a intentar). El
  // barrido automático solo reintenta los PENDIENTE.
  if (recibo.estado !== 'PENDIENTE' && recibo.estado !== 'FALLIDO') {
    return { ok: false, error: 'Este recibo ya no está pendiente', errorCode: 'NO_PENDIENTE' };
  }
  // Idempotency-Key anclada al recibo + nº de intento (ver nota al inicio).
  const idempotencyKey = `offsession-cobro-${params.reciboId}-i${recibo.intentos_reintento ?? 0}`;
  if (socioError || !socio?.stripe_customer_id) {
    return { ok: false, error: 'La socia no tiene método de pago guardado', errorCode: 'SIN_TARJETA' };
  }
  // Elige método: SEPA domiciliado (si la socia lo tiene listo y preferido) o
  // tarjeta guardada. Si no hay ninguno, no se puede cobrar sola.
  const metodo = elegirMetodoCobro(socio);
  if (!metodo.ok) {
    return { ok: false, error: 'La socia no tiene tarjeta ni mandato SEPA guardado', errorCode: 'SIN_TARJETA' };
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
    // R2: take-rate de plataforma (apagado por defecto; ver lib/billing/stripe-fees.ts).
    const fee = applicationFeeAmount(amountCents);
    const esSepa = metodo.metodo === 'SEPA';
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'eur',
      customer: socio.stripe_customer_id,
      payment_method: metodo.paymentMethodId,
      // SEPA se cobra por adeudo domiciliado; la tarjeta usa el flujo por defecto.
      ...(esSepa ? { payment_method_types: ['sepa_debit'] } : {}),
      ...(esSepa && metodo.mandateId ? { mandate: metodo.mandateId } : {}),
      off_session: true,
      confirm: true,
      metadata: { reciboId: params.reciboId, socioId: params.socioId, origen: esSepa ? 'sepa_recibo' : 'tarjeta_recibo' },
      ...(fee !== undefined ? { application_fee_amount: fee } : {}),
    }, { stripeAccount: studio.stripe_account_id, idempotencyKey });

    // SEPA es ASÍNCRONO: tras confirmar off-session el estado normal es
    // 'processing' (el adeudo tarda días y puede devolverse hasta 8 semanas).
    // NO es un fallo: el recibo pasa a EN_CURSO y el webhook
    // (payment_intent.succeeded / .payment_failed) lo resolverá — PR-4. Solo se
    // marca COBRADO cuando Stripe confirma 'succeeded'.
    if (esSepa && paymentIntent.status === 'processing') {
      const { error: updErr } = await admin
        .from('recibos').update({ estado: 'EN_CURSO', metodo_cobro: 'SEPA', sepa_estado: 'processing' }).eq('id', params.reciboId);
      if (updErr) {
        Sentry.captureException(new Error(`Adeudo SEPA enviado pero no se pudo marcar el recibo EN_CURSO: ${updErr.message}`), {
          level: 'error', tags: { area: 'cobros', tipo: 'reconciliacion' },
          extra: { reciboId: params.reciboId, socioId: params.socioId, paymentIntentId: paymentIntent.id },
        });
      }
      return { ok: true, status: paymentIntent.status, importe: recibo.importe };
    }

    if (paymentIntent.status === 'succeeded') {
      // I6: Stripe YA cobró. Si el update del recibo falla, no lo tragamos: la
      // idempotency key evita el doble cargo, pero el recibo quedaría PENDIENTE y
      // podría reaparecer para cobro → la reconciliación se rompe. Lo registramos
      // en Sentry con el reciboId/paymentIntent para reconciliación manual.
      const { error: updErr } = await admin
        .from('recibos').update({
          estado: 'COBRADO', fecha_cobro: new Date().toISOString(), metodo_cobro: metodo.metodo,
          ...(esSepa ? { sepa_estado: 'succeeded' } : {}),
        }).eq('id', params.reciboId);
      if (updErr) {
        Sentry.captureException(new Error(`Cobro OK en Stripe pero no se pudo marcar el recibo COBRADO: ${updErr.message}`), {
          level: 'error',
          tags: { area: 'cobros', tipo: 'reconciliacion' },
          extra: { reciboId: params.reciboId, socioId: params.socioId, paymentIntentId: paymentIntent.id },
        });
      }
      return { ok: true, status: paymentIntent.status, importe: recibo.importe };
    }

    // requires_action u otro estado no terminal: la tarjeta necesita
    // autenticación (3DS) que no se puede completar sin la socia presente.
    return {
      ok: false, status: paymentIntent.status, errorCode: 'FALLO_COBRO',
      error: esSepa
        ? `El adeudo SEPA no se pudo iniciar (estado: ${paymentIntent.status}). Revisa el mandato de la socia.`
        : 'El banco pidió autenticación adicional (3DS) que no se puede completar sin la socia presente. Pídele que pague desde un enlace de cobro normal.',
    };
  } catch (err) {
    const mensaje = err instanceof Stripe.errors.StripeError
      ? err.message
      : (err instanceof Error ? err.message : 'Error desconocido al cobrar');
    return { ok: false, error: mensaje, errorCode: 'FALLO_COBRO' };
  }
}
