import Stripe from 'stripe';
import * as Sentry from '@sentry/nextjs';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { applicationFeeAmount } from '@/lib/billing/stripe-fees';
import { comprobarModoStripe } from '@/lib/billing/modo-stripe';
import { elegirMetodoCobro } from '@/lib/billing/metodo-cobro';
import { clasificarErrorCobro } from '@/lib/billing/clasificar-error-cobro';
import { aplicarRenovacionServidor } from '@/lib/billing/renovacion-server';
import { sellarFacturaDeRecibo } from '@/lib/billing/sellar-factura-server';
import { hoyEnEstudio } from '@/lib/utils';

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

export type CobroErrorCode = 'NO_CONFIGURADO' | 'NO_ENCONTRADO' | 'NO_PENDIENTE' | 'SIN_TARJETA' | 'SIN_STRIPE_CONECTADO' | 'CUENTA_NO_LISTA' | 'FALLO_COBRO' | 'ERROR_TRANSITORIO' | 'SUSCRIPCION_PAUSADA' | 'MODO_STRIPE_CRUZADO';

export interface ResultadoCobro {
  ok: boolean;
  status?: string;
  error?: string;
  errorCode?: CobroErrorCode;
  importe?: number;
  // Cobro correcto en Stripe cuya persistencia falló: ok=true, pero el llamante
  // NO debe darlo por cerrado — el recibo requiere reconciliación manual.
  aviso?: 'COBRADO_SIN_PERSISTIR';
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
  // El modo de la clave tiene que pegar con dónde corre esto. Va AQUÍ, en el
  // único sitio por el que pasa todo cobro automático (dunning, penalizaciones,
  // charge-off-session): un `npm run dev` con el `.env.local` de producción
  // copiado cobraría de verdad a socias reales, y una clave de test en
  // producción marcaría recibos COBRADO sin que entrara un euro.
  // Ver lib/billing/modo-stripe.ts.
  const modo = comprobarModoStripe();
  if (!modo.puedeCobrar) {
    return { ok: false, error: modo.motivo ?? 'Modo de Stripe incompatible con el entorno', errorCode: 'MODO_STRIPE_CRUZADO' };
  }
  const stripe = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });

  const admin = getSupabaseAdmin();
  if (!admin) {
    return { ok: false, error: 'Servicio no configurado (service role)', errorCode: 'NO_CONFIGURADO' };
  }

  const [{ data: recibo, error: reciboError }, { data: socio, error: socioError }, { data: studio, error: studioError }] = await Promise.all([
    // Multi-tenancy: recibo y socia se filtran TAMBIÉN por studio_id. Con
    // service-role no hay RLS que lo haga, así que sin este filtro un reciboId de
    // otro estudio se cobraba contra la cuenta de Stripe del estudio llamante.
    admin.from('recibos').select('*').eq('id', params.reciboId).eq('studio_id', params.studioId).single(),
    admin.from('socios').select('*').eq('id', params.socioId).eq('studio_id', params.studioId).single(),
    admin.from('studios').select('stripe_account_id').eq('id', params.studioId).single(),
  ]);

  if (reciboError || !recibo) {
    return { ok: false, error: 'Recibo no encontrado', errorCode: 'NO_ENCONTRADO' };
  }
  // El filtro de arriba comprueba que el recibo es del estudio y que la socia es
  // del estudio — pero NO que el recibo sea DE ESA SOCIA. Dos de los tres
  // llamantes (`/api/stripe/charge-off-session` y `/api/cobros/cobrar-online`)
  // toman `socioId` del body sin cruzarlo con nada, así que el recibo de A se
  // cobraba a la tarjeta guardada de B: un cargo real a una tarjeta ajena, y el
  // `metadata.socioId` del PaymentIntent apuntando a quien no lo debía. No cruza
  // estudios, pero un typo en la UI basta para provocarlo.
  if (recibo.socio_id !== params.socioId) {
    return { ok: false, error: 'Recibo no encontrado', errorCode: 'NO_ENCONTRADO' };
  }
  // Se puede cobrar un recibo PENDIENTE o uno FALLIDO (recuperación manual tras
  // agotar el dunning: si la socia paga más adelante, se vuelve a intentar). El
  // barrido automático solo reintenta los PENDIENTE.
  if (recibo.estado !== 'PENDIENTE' && recibo.estado !== 'FALLIDO') {
    return { ok: false, error: 'Este recibo ya no está pendiente', errorCode: 'NO_PENDIENTE' };
  }
  // Congelaciones: si la suscripción del recibo está PAUSADA (staff la congeló
  // a propósito), no se cobra. Sin esto, un recibo PENDIENTE generado ANTES de
  // congelar seguía cobrándose durante la pausa, y encima aplicarRenovacionServidor
  // reactivaba la suscripción al confirmar el cargo — deshaciendo la congelación
  // sin que nadie lo pidiera.
  if (recibo.suscripcion_id) {
    const { data: sus } = await admin
      .from('suscripciones').select('estado').eq('id', recibo.suscripcion_id).eq('studio_id', params.studioId).maybeSingle();
    if (sus?.estado === 'PAUSADA') {
      return { ok: false, error: 'La suscripción está congelada: descongélala antes de cobrar este recibo', errorCode: 'SUSCRIPCION_PAUSADA' };
    }
  }
  // Idempotency-Key anclada al recibo + nº de intento (ver nota al inicio).
  const idempotencyKey = `offsession-cobro-${params.reciboId}-i${recibo.intentos_reintento ?? 0}`;
  // Se distingue "no existe / no es de este estudio" de "existe pero sin método":
  // con el filtro por studio_id, una socia de otro tenant llega aquí como null y
  // decir "no tiene método de pago" sería engañoso.
  if (socioError || !socio) {
    return { ok: false, error: 'Socia no encontrada', errorCode: 'NO_ENCONTRADO' };
  }
  if (!socio.stripe_customer_id) {
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
      // F-31 (auditoría 20ª pasada): regla de la casa incumplida — su gemelo
      // de abajo (rama 'succeeded') ya acota por studio_id, este no. No
      // explotable hoy (`params.reciboId` ya viene validado contra
      // `studio_id` por el SELECT del arranque de la función), pero un
      // UPDATE de dinero nunca debe depender de que esa validación previa
      // se mantenga si el código de alrededor cambia.
      const { error: updErr } = await admin
        .from('recibos').update({ estado: 'EN_CURSO', metodo_cobro: 'SEPA', sepa_estado: 'processing', stripe_payment_intent_id: paymentIntent.id })
        .eq('id', params.reciboId).eq('studio_id', params.studioId);
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
          // P-9 (auditoría 21ª pasada): `fecha_cobro` es `date` — un ISO en
          // UTC fechaba el día anterior un cobro a la 01:30 de Madrid.
          estado: 'COBRADO', fecha_cobro: hoyEnEstudio(), metodo_cobro: metodo.metodo,
          // El hilo de vuelta a Stripe. Antes solo se guardaba en la rama SEPA
          // `processing`, así que un cobro con tarjeta que salía BIEN no dejaba
          // ninguna forma de llegar a su cargo — y sin eso no se puede devolver
          // desde el panel (`app/api/reembolsos`). Cuesta una columna que ya
          // existía desde 0000_base y que nadie rellenaba en este camino.
          stripe_payment_intent_id: paymentIntent.id,
          ...(esSepa ? { sepa_estado: 'succeeded' } : {}),
        }).eq('id', params.reciboId).eq('studio_id', params.studioId);
      if (updErr) {
        Sentry.captureException(new Error(`Cobro OK en Stripe pero no se pudo marcar el recibo COBRADO: ${updErr.message}`), {
          level: 'error',
          tags: { area: 'cobros', tipo: 'reconciliacion' },
          extra: { reciboId: params.reciboId, socioId: params.socioId, paymentIntentId: paymentIntent.id },
        });
        // Además del aviso a Sentry, se devuelve un resultado DISTINGUIBLE: el
        // llamante marcaba el cobro como EJECUTADO y respondía 200, así que el
        // fallo de persistencia quedaba invisible para quien operaba.
        return {
          ok: true, status: paymentIntent.status, importe: recibo.importe,
          aviso: 'COBRADO_SIN_PERSISTIR',
          error: 'El cobro se completó en Stripe pero no se pudo marcar el recibo como COBRADO. Revísalo manualmente.',
        };
      }
      // Post-cobro, en el servidor (antes solo pasaba al "marcar cobrado" a
      // mano en el panel): renovar la suscripción del recibo (refill de bono /
      // extensión del mensual) y sellar su factura. Ambos son best-effort e
      // idempotentes — el cobro ya está hecho y persistido.
      await aplicarRenovacionServidor(admin, { studioId: params.studioId, reciboId: params.reciboId });
      const sellado = await sellarFacturaDeRecibo(admin, {
        studioId: params.studioId, reciboId: params.reciboId, facturaId: `fac-off-${params.reciboId}`,
      });
      if (!sellado.ok) {
        Sentry.captureMessage('[cobrarReciboOffSession] cobro OK pero factura sin sellar', {
          level: 'warning', tags: { area: 'cobros', tipo: 'facturacion' },
          extra: { reciboId: params.reciboId, error: sellado.error },
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
    // El mensaje de Stripe/JS es para el log, nunca para la socia ni para quien
    // aprueba el cobro desde Automatizaciones (mismo criterio que setup-sepa).
    const detalle = err instanceof Stripe.errors.StripeError
      ? err.message
      : (err instanceof Error ? err.message : 'Error desconocido al cobrar');
    console.error('[cobrarReciboOffSession]', detalle);

    // D-5 (auditoría 20-ago): un fallo de infraestructura NO es un rechazo del
    // cobro. El porqué completo (y la trampa del doble cargo real que había
    // aquí: contador arriba → clave de idempotencia nueva → si el cargo
    // original entró y se perdió la respuesta, segundo cargo) está en
    // lib/billing/clasificar-error-cobro.ts, que es donde la regla se fija con
    // tests. El dunning ya trata cualquier código distinto de FALLO_COBRO como
    // "omitido, se reintenta el siguiente barrido sin contar intento" — que
    // con la MISMA clave de idempotencia es exactamente el reintento seguro.
    if (clasificarErrorCobro(err) === 'ERROR_TRANSITORIO') {
      Sentry.captureMessage('[cobrarReciboOffSession] fallo transitorio: el desenlace del cargo es DESCONOCIDO', {
        level: 'warning',
        tags: { area: 'cobros', tipo: 'cobro-transitorio' },
        extra: { reciboId: params.reciboId, socioId: params.socioId, studioId: params.studioId, idempotencyKey, detalle },
      });
      return {
        ok: false, errorCode: 'ERROR_TRANSITORIO',
        error: 'Stripe no respondió y el cobro quedó sin confirmar. Se reintentará solo con la misma clave, sin riesgo de doble cargo.',
      };
    }
    return { ok: false, error: 'No se pudo completar el cobro. Inténtalo de nuevo más tarde.', errorCode: 'FALLO_COBRO' };
  }
}
