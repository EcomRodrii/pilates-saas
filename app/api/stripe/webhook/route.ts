import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import * as Sentry from '@sentry/nextjs';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { capturar } from '@/lib/analytics';
import { webhookYaProcesado, marcarWebhookProcesado } from '@/lib/webhook-idempotencia';
import { sellarFacturaDeRecibo } from '@/lib/billing/sellar-factura-server';
import { registrarFalloCobro } from '@/lib/billing/dunning-server';

export async function POST(req: NextRequest) {
  const key = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  // Los eventos de las cuentas conectadas (Stripe Connect) llegan a este mismo
  // endpoint pero firmados con un secreto de webhook distinto — el que
  // Stripe genera en el endpoint "Connect" del Dashboard, no el de la cuenta
  // de la plataforma.
  const connectWebhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  if (!key || key.startsWith('sk_test_XXXX')) {
    return NextResponse.json({ error: 'Stripe no configurado' }, { status: 503 });
  }

  const stripe = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });
  const body = await req.text();
  const sig = req.headers.get('stripe-signature') ?? '';

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret ?? '');
  } catch {
    try {
      event = stripe.webhooks.constructEvent(body, sig, connectWebhookSecret ?? '');
    } catch {
      return NextResponse.json({ error: 'Webhook signature inválida' }, { status: 400 });
    }
  }

  // M10: idempotencia por event.id — si este evento ya se procesó con éxito
  // (Stripe reintenta / re-entrega), lo reconocemos y salimos sin reprocesar.
  const adminDedup = getSupabaseAdmin();
  if (adminDedup && await webhookYaProcesado(adminDedup, event.id)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  // Esta es la fuente de verdad real del pago — el redirect al navegador
  // (success_url) solo actualiza la UI de forma optimista, pero si el
  // navegador se cierra antes de volver, esto es lo único que sí confirma
  // el cobro contra la base de datos.
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const reciboId = session.metadata?.reciboId;
    const socioId = session.metadata?.socioId;
    const studioId = session.metadata?.studioId;

    // P0-18: la persistencia se hace con service-role (bypassa RLS; el webhook
    // no tiene sesión de usuario) y cualquier fallo de escritura devuelve un
    // 5xx para que Stripe REINTENTE la entrega. Antes, dbUpdate* solo hacía
    // console.error sin lanzar y el endpoint respondía 200 igualmente: el pago
    // se cobraba en Stripe pero el recibo quedaba PENDIENTE para siempre.
    const admin = getSupabaseAdmin();
    if (!admin) {
      console.error('[stripe webhook] service role no configurada');
      return NextResponse.json({ error: 'Persistencia no disponible' }, { status: 503 });
    }

    if (session.mode === 'setup' && session.metadata?.purpose === 'sepa_mandate') {
      // Fase 1 · PR-2 — alta de mandato SEPA: la socia aceptó la domiciliación.
      // Guardamos el PaymentMethod (sepa_debit) y el mandato para poder cobrar
      // la mensualidad off-session (PR-3). El SetupIntent vive en la cuenta
      // conectada (event.account) — hay que targetearla explícitamente.
      if (socioId && typeof session.setup_intent === 'string') {
        const si = await stripe.setupIntents.retrieve(
          session.setup_intent,
          {},
          event.account ? { stripeAccount: event.account } : undefined,
        );
        const pmId = typeof si.payment_method === 'string' ? si.payment_method : si.payment_method?.id;
        const mandateId = typeof si.mandate === 'string' ? si.mandate : (si.mandate?.id ?? null);
        if (pmId) {
          const update: Record<string, string | null> = {
            sepa_payment_method_id: pmId,
            sepa_mandate_id: mandateId,
            metodo_pago_preferido: 'SEPA',
          };
          if (typeof session.customer === 'string') update.stripe_customer_id = session.customer;
          const { error } = await admin.from('socios').update(update).eq('id', socioId);
          if (error) {
            console.error('[stripe webhook] no se pudo guardar el mandato SEPA', socioId, error);
            return NextResponse.json({ error: 'Fallo al guardar el mandato SEPA' }, { status: 500 });
          }
        }
      }
    } else {
      // La sesión puede completarse SIN pago (importe diferido, método pendiente
      // de confirmación). Marcar COBRADO en ese caso da por cobrado dinero que no
      // ha entrado. Se responde 200 para que Stripe no reintente: el evento es
      // válido, simplemente no confirma ningún cobro.
      // Va DENTRO de esta rama a propósito: el alta de mandato SEPA (arriba) es
      // mode='setup' y nunca tiene payment_status 'paid'.
      if (session.payment_status !== 'paid') {
        return NextResponse.json({ received: true, ignorado: 'pago_no_completado' });
      }

      // El recibo es lo crítico (confirma el cobro). Registramos el método real
      // del cobro (tarjeta/bizum) para la conciliación con el gestor.
      if (reciboId) {
        // Sin studioId no se puede comprobar que el recibo pertenezca a este
        // estudio, y el UPDATE iría sin acotar por tenant.
        if (!studioId) {
          Sentry.captureMessage('[stripe webhook] checkout.session con reciboId sin studioId', {
            level: 'error', extra: { reciboId, sessionId: session.id },
          });
          return NextResponse.json({ error: 'Metadata incompleta' }, { status: 400 });
        }
        const [{ data: reciboRow }, { data: studioRow }] = await Promise.all([
          admin.from('recibos').select('id, importe, estado').eq('id', reciboId).eq('studio_id', studioId).maybeSingle(),
          admin.from('studios').select('stripe_account_id').eq('id', studioId).maybeSingle(),
        ]);
        if (!reciboRow) {
          Sentry.captureMessage('[stripe webhook] checkout.session apunta a recibo inexistente o de otro estudio', {
            level: 'warning', extra: { reciboId, studioId, sessionId: session.id },
          });
          return NextResponse.json({ error: 'Recibo no encontrado' }, { status: 404 });
        }
        // La cuenta Connect que emite el evento debe ser la del estudio dueño del
        // recibo: si no, un estudio podría confirmar el recibo de otro.
        if (event.account && studioRow?.stripe_account_id && event.account !== studioRow.stripe_account_id) {
          Sentry.captureMessage('[stripe webhook] cuenta Connect no coincide con el estudio del recibo', {
            level: 'error',
            extra: { reciboId, studioId, eventAccount: event.account, expectedAccount: studioRow.stripe_account_id },
          });
          return NextResponse.json({ error: 'Cuenta Connect no autorizada para este recibo' }, { status: 403 });
        }
        const esperadoCentimos = Math.round(Number(reciboRow.importe) * 100);
        if (typeof session.amount_total !== 'number' || session.amount_total < esperadoCentimos) {
          Sentry.captureMessage('[stripe webhook] importe de checkout inferior al recibo', {
            level: 'error', extra: { reciboId, studioId, amountTotal: session.amount_total, esperadoCentimos },
          });
          return NextResponse.json({ error: 'Importe insuficiente' }, { status: 409 });
        }
        // Si se ofreció Bizum, el método real puede ser bizum O tarjeta → lo
        // leemos del cargo para registrar metodo_cobro con exactitud. Si no se
        // ofreció Bizum, es tarjeta y evitamos la llamada extra.
        const pmTypes = (session.payment_method_types ?? []) as string[];
        let metodoCobro = 'TARJETA';
        if (pmTypes.includes('bizum') && typeof session.payment_intent === 'string') {
          try {
            const piPago = await stripe.paymentIntents.retrieve(
              session.payment_intent, { expand: ['latest_charge'] },
              event.account ? { stripeAccount: event.account } : undefined,
            );
            const tipo = (piPago.latest_charge as Stripe.Charge | null)?.payment_method_details?.type;
            metodoCobro = tipo === 'bizum' ? 'BIZUM' : 'TARJETA';
          } catch { /* si falla la lectura, dejamos TARJETA por defecto */ }
        }
        const { error } = await admin.from('recibos')
          .update({ estado: 'COBRADO', fecha_cobro: new Date().toISOString(), metodo_cobro: metodoCobro })
          // Acotado al tenant y a los estados realmente cobrables. PENDIENTE y
          // FALLIDO (recuperación tras dunning) sí; así un evento tardío o
          // duplicado no reescribe la fecha_cobro de un recibo ya COBRADO ni
          // resucita uno ANULADO/DEVUELTO. 0 filas afectadas no es un error.
          .eq('id', reciboId).eq('studio_id', studioId)
          .in('estado', ['PENDIENTE', 'FALLIDO']);
        if (error) {
          console.error('[stripe webhook] no se pudo marcar el recibo como COBRADO', reciboId, error);
          return NextResponse.json({ error: 'Fallo al persistir el cobro' }, { status: 500 });
        }
      }

      // Guarda la tarjeta (Customer + PaymentMethod) para poder cobrar sola la
      // próxima vez. También crítico: un fallo aquí devuelve 5xx para reintentar
      // (idempotente: mismos customer/payment_method). Bizum no es guardable, así
      // que solo persiste tarjeta (setup_future_usage solo se pide en 'card').
      if (socioId && typeof session.customer === 'string' && typeof session.payment_intent === 'string') {
        // Este PaymentIntent vive en la cuenta conectada del estudio (event.account),
        // no en la de la plataforma — hay que targetearla explícitamente o Stripe
        // devuelve "no such payment_intent".
        const paymentIntent = await stripe.paymentIntents.retrieve(
          session.payment_intent,
          {},
          event.account ? { stripeAccount: event.account } : undefined
        );
        const paymentMethodId = typeof paymentIntent.payment_method === 'string'
          ? paymentIntent.payment_method
          : paymentIntent.payment_method?.id;
        // Solo guardamos como método recurrente si es una tarjeta reutilizable.
        const piPmTypes = (paymentIntent.payment_method_types ?? []) as string[];
        const esTarjetaReutilizable = piPmTypes.includes('card')
          && paymentIntent.setup_future_usage === 'off_session';
        if (paymentMethodId && esTarjetaReutilizable) {
          if (!studioId) {
            // Sin studioId no se puede acotar el UPDATE al estudio dueño de la
            // socia: preferimos no escribir a escribir cross-tenant sobre un id
            // que viene de metadata.
            Sentry.captureMessage('[stripe webhook] checkout.session sin studioId: no se guarda la tarjeta', {
              level: 'warning', extra: { socioId, sessionId: session.id },
            });
          } else {
            const { error } = await admin.from('socios')
              .update({ stripe_customer_id: session.customer, stripe_payment_method_id: paymentMethodId })
              .eq('id', socioId).eq('studio_id', studioId);
            if (error) {
              console.error('[stripe webhook] no se pudo guardar la tarjeta de la socia', socioId, error);
              return NextResponse.json({ error: 'Fallo al guardar el método de pago' }, { status: 500 });
            }
          }
        }
      }
    }

    // R4: señal de GMV (analítica de producto, no-op si POSTHOG_KEY no está).
    if (studioId && typeof session.amount_total === 'number') {
      capturar(studioId, { nombre: 'pago_completado', props: { importe_centimos: session.amount_total, via: 'checkout' } });
    }
  }

  // A-14 (backstop): el cobro por datáfono se confirma aquí aunque el POS se haya
  // cerrado tras el tap. Deja un marcador de reconciliación (idempotente por
  // PaymentIntent) para que ningún cobro quede sin registrar. El flujo normal del
  // POS lo marcará RECONCILIADO; si no llega a hacerlo, queda PENDIENTE y el staff
  // lo completa desde el POS. Solo aplica a los PI de terminal (origen marcado al
  // crearlos en /api/terminal/cobrar); el resto de payment_intent.succeeded se
  // ignora (los cobros con checkout ya se persisten vía checkout.session.completed).
  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object as Stripe.PaymentIntent;
    // Backstop de reconciliación POS: datáfono (pos_terminal) y Bizum presencial
    // (pos_bizum) comparten el mismo mecanismo — si el POS se cerró antes de
    // registrar la venta, el cobro aparece en "cobros sin registrar".
    const origenPos = pi.metadata?.origen;
    if (origenPos === 'pos_terminal' || origenPos === 'pos_bizum') {
      const studioId = pi.metadata.studioId;
      if (!studioId) {
        console.error('[stripe webhook] PI de terminal sin studioId en metadata', pi.id);
        return NextResponse.json({ received: true });
      }
      const admin = getSupabaseAdmin();
      if (!admin) {
        console.error('[stripe webhook] service role no configurada (reconciliación POS)');
        return NextResponse.json({ error: 'Persistencia no disponible' }, { status: 503 });
      }
      // Insert idempotente: si el POS ya registró la venta y marcó el marcador
      // RECONCILIADO, la PK del PaymentIntent hace que este INSERT choque (23505)
      // y no pisamos ese estado. Cualquier otro error → 5xx para que Stripe
      // reintente la entrega (no perder el cobro).
      const { error } = await admin.from('reconciliaciones_pos').insert({
        payment_intent_id: pi.id,
        studio_id: studioId,
        importe: (pi.amount_received ?? pi.amount ?? 0) / 100,
        concepto: pi.metadata.concepto ?? 'Venta POS',
      });
      if (error && error.code !== '23505') {
        console.error('[stripe webhook] no se pudo registrar la reconciliación POS', pi.id, error);
        return NextResponse.json({ error: 'Fallo al registrar la reconciliación' }, { status: 500 });
      }

      // R4: señal de GMV del cobro presencial (datáfono o Bizum).
      capturar(studioId, { nombre: 'pago_completado', props: { importe_centimos: pi.amount_received ?? pi.amount ?? 0, via: origenPos === 'pos_bizum' ? 'bizum' : 'terminal' } });
    }

    // Fase 1 · PR-4 — cobro SEPA CONFIRMADO (asíncrono): el adeudo domiciliado
    // liquidó días después de enviarse. Marcamos el recibo COBRADO y sellamos su
    // factura del ciclo. El sellado es best-effort: un fallo NO bloquea la
    // confirmación del pago (se puede sellar a mano después) — evita reintentos
    // infinitos del webhook por un caso borde de facturación.
    if (pi.metadata?.origen === 'sepa_recibo' && pi.metadata?.reciboId) {
      const reciboId = pi.metadata.reciboId;
      const admin = getSupabaseAdmin();
      if (!admin) {
        console.error('[stripe webhook] service role no configurada (SEPA succeeded)');
        return NextResponse.json({ error: 'Persistencia no disponible' }, { status: 503 });
      }
      const { data: rec, error: updErr } = await admin.from('recibos')
        .update({ estado: 'COBRADO', fecha_cobro: new Date().toISOString(), metodo_cobro: 'SEPA', sepa_estado: 'succeeded' })
        .eq('id', reciboId).select('studio_id').maybeSingle();
      if (updErr) {
        console.error('[stripe webhook] no se pudo marcar el recibo SEPA COBRADO', reciboId, updErr);
        return NextResponse.json({ error: 'Fallo al confirmar el cobro SEPA' }, { status: 500 });
      }
      if (rec?.studio_id) {
        try {
          const sell = await sellarFacturaDeRecibo(admin, { studioId: rec.studio_id, reciboId, facturaId: `fac-sepa-${reciboId}` });
          if (!sell.ok) throw new Error(sell.error ?? 'sellado falló');
        } catch (e) {
          Sentry.captureException(e instanceof Error ? e : new Error('Fallo al sellar la factura del cobro SEPA'), {
            level: 'warning', tags: { area: 'facturacion', tipo: 'sepa_ciclo' }, extra: { reciboId },
          });
        }
      }
      capturar(pi.metadata.studioId ?? rec?.studio_id ?? '', { nombre: 'pago_completado', props: { importe_centimos: pi.amount_received ?? pi.amount ?? 0, via: 'sepa' } });
    }
  }

  // Fase 1 · PR-4 — adeudo SEPA FALLIDO (p. ej. fondos insuficientes al liquidar).
  // El recibo vuelve a PENDIENTE (para que el dunning pueda reintentar con un
  // adeudo nuevo) y contamos el intento. sepa_estado='failed' deja rastro.
  if (event.type === 'payment_intent.payment_failed') {
    const pi = event.data.object as Stripe.PaymentIntent;
    if (pi.metadata?.origen === 'sepa_recibo' && pi.metadata?.reciboId) {
      const reciboId = pi.metadata.reciboId;
      const admin = getSupabaseAdmin();
      if (!admin) {
        console.error('[stripe webhook] service role no configurada (SEPA failed)');
        return NextResponse.json({ error: 'Persistencia no disponible' }, { status: 503 });
      }
      // Dunning (0041): cuenta el intento, reprograma el siguiente reintento
      // (+3/+7 días) o marca el recibo FALLIDO tras el tercero, y notifica a la
      // socia (1.er fallo / fallo definitivo) y al estudio (fallo definitivo).
      try {
        await registrarFalloCobro({ admin, reciboId, esSepa: true, ahoraISO: new Date().toISOString() });
      } catch (e) {
        console.error('[stripe webhook] no se pudo registrar el adeudo SEPA fallido (dunning)', reciboId, e);
        return NextResponse.json({ error: 'Fallo al registrar el adeudo SEPA fallido' }, { status: 500 });
      }
    }
  }

  // Fase 1 · PR-4 — DEVOLUCIÓN / reembolso (el adeudo SEPA se devolvió dentro de
  // las 8 semanas, o un reembolso manual). El recibo pasa a DEVUELTO. Los datos
  // de metadata viven en el PaymentIntent (no en el charge), así que lo
  // recuperamos targeteando la cuenta conectada.
  if (event.type === 'charge.refunded') {
    const charge = event.data.object as Stripe.Charge;
    const piId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
    if (piId) {
      const pi = await stripe.paymentIntents.retrieve(piId, {}, event.account ? { stripeAccount: event.account } : undefined);
      const reciboId = pi.metadata?.reciboId;
      const esRecibo = pi.metadata?.origen === 'sepa_recibo' || pi.metadata?.origen === 'tarjeta_recibo';
      if (reciboId && esRecibo) {
        const admin = getSupabaseAdmin();
        if (!admin) {
          console.error('[stripe webhook] service role no configurada (refund)');
          return NextResponse.json({ error: 'Persistencia no disponible' }, { status: 503 });
        }
        const { error } = await admin.from('recibos')
          .update({ estado: 'DEVUELTO', fecha_devolucion: new Date().toISOString(), sepa_estado: pi.metadata?.origen === 'sepa_recibo' ? 'returned' : null })
          .eq('id', reciboId);
        if (error) {
          console.error('[stripe webhook] no se pudo marcar el recibo DEVUELTO', reciboId, error);
          return NextResponse.json({ error: 'Fallo al registrar la devolución' }, { status: 500 });
        }
      }
    }
  }

  // Stripe Connect: el estudio revocó el acceso desde SU panel de Stripe (o Stripe
  // desconectó la cuenta). Limpiamos el binding `stripe_account_id` para que la app
  // deje de intentar cobrar sobre una cuenta ya no conectada y la UI muestre "no
  // conectado". Idempotente: si ya está a null, el UPDATE no casa ninguna fila.
  if (event.type === 'account.application.deauthorized') {
    const accountId = event.account;
    if (accountId) {
      const admin = getSupabaseAdmin();
      if (!admin) {
        console.error('[stripe webhook] service role no configurada (deauthorized)');
        return NextResponse.json({ error: 'Persistencia no disponible' }, { status: 503 });
      }
      const { error } = await admin.from('studios').update({ stripe_account_id: null }).eq('stripe_account_id', accountId);
      if (error) {
        console.error('[stripe webhook] no se pudo desvincular la cuenta desconectada', accountId, error);
        return NextResponse.json({ error: 'Fallo al desvincular la cuenta' }, { status: 500 });
      }
    }
  }

  // M10: marcar el evento como procesado (solo se llega aquí si todos los
  // handlers fueron OK; los caminos de error devuelven 5xx antes y NO marcan,
  // para que Stripe reintente).
  if (adminDedup) await marcarWebhookProcesado(adminDedup, event.id, event.type);
  return NextResponse.json({ received: true });
}
