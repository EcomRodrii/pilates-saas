import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import * as Sentry from '@sentry/nextjs';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { verificarSesionStaff } from '@/lib/auth-server';
import { puedeMoverDinero } from '@/lib/permisos-reglas';
import { bloqueoPorSuscripcion } from '@/lib/billing/billing-guard';
import { evaluarReembolso, type PoliticaReembolso } from '@/lib/billing/politica-reembolso';
import { paramsReembolso } from '@/lib/billing/reembolso-params';

export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────────
// Devolver un recibo desde el panel.
//
// Hasta ahora Tentare solo REACCIONABA: el webhook de `charge.refunded` marcaba
// el recibo DEVUELTO, anotaba la fila en `devoluciones` y ofrecía revertir la
// entrega — pero el reembolso había que hacerlo a mano en Stripe.
//
// Este endpoint solo hace UNA cosa: pedirle el reembolso a Stripe. Todo lo que
// viene después (marcar el recibo, la factura rectificativa, avisar a la socia,
// ofrecer quitarle el bono) ya lo hace el webhook, y se deja que lo siga
// haciendo él. Duplicarlo aquí daría dos caminos que tarde o temprano dirían
// cosas distintas, y además el reembolso hecho desde Stripe seguiría existiendo.
//
// O sea: aquí NO se toca `recibos` ni `devoluciones`. Es a propósito.
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  // La UI esconde el botón, pero la UI nunca es el límite: una instructora que
  // llame a este endpoint a mano se para aquí.
  if (!puedeMoverDinero(sesion.rol)) {
    return NextResponse.json({ error: 'Tu rol no puede devolver dinero' }, { status: 403 });
  }

  const body = await req.json().catch(() => null) as { reciboId?: string } | null;
  if (!body?.reciboId) return NextResponse.json({ error: 'Falta el recibo' }, { status: 400 });

  const bloqueo = await bloqueoPorSuscripcion(sesion.studioId);
  if (bloqueo) return bloqueo;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Service role no configurada' }, { status: 503 });

  const { data: studio } = await admin
    .from('studios')
    .select('stripe_account_id, reembolsos_activos, reembolso_plazo_dias, reembolso_solo_sin_usar')
    .eq('id', sesion.studioId).maybeSingle();
  if (!studio?.stripe_account_id) {
    return NextResponse.json({ error: 'Este estudio no tiene Stripe conectado.' }, { status: 409 });
  }

  // `.eq('studio_id')` además del id: sin él, un id de recibo de OTRO estudio
  // se devolvería con la cuenta de Stripe de este. Mismo criterio que el resto
  // de endpoints de dinero del repo.
  const { data: recibo } = await admin
    .from('recibos')
    .select('id, estado, importe, fecha_cobro, suscripcion_id, entrega_sesiones_despues, stripe_payment_intent_id')
    .eq('id', body.reciboId).eq('studio_id', sesion.studioId).maybeSingle();
  if (!recibo) return NextResponse.json({ error: 'Recibo no encontrado' }, { status: 404 });

  // Sesiones que le quedan HOY al bono de ese recibo: la otra mitad de la regla
  // `soloSinUsar`. Si el recibo no tiene suscripción (una cita suelta), se
  // queda en null y la regla no aplica — no se inventa consumo.
  let sesionesRestantesHoy: number | null = null;
  if (recibo.suscripcion_id) {
    const { data: sus } = await admin
      .from('suscripciones').select('sesiones_restantes')
      .eq('id', recibo.suscripcion_id).eq('studio_id', sesion.studioId).maybeSingle();
    sesionesRestantesHoy = (sus?.sesiones_restantes as number | null) ?? null;
  }

  const politica: PoliticaReembolso = {
    activos: studio.reembolsos_activos ?? false,
    plazoDias: studio.reembolso_plazo_dias ?? 14,
    soloSinUsar: studio.reembolso_solo_sin_usar ?? true,
  };
  const veredicto = evaluarReembolso(politica, {
    estado: recibo.estado as string,
    importe: Number(recibo.importe ?? 0),
    fechaCobro: (recibo.fecha_cobro as string | null) ?? null,
    sesionesAlEntregar: (recibo.entrega_sesiones_despues as number | null) ?? null,
    sesionesRestantesHoy,
  }, new Date());
  if (!veredicto.permitido) {
    return NextResponse.json({ error: veredicto.mensaje, motivo: veredicto.motivo }, { status: 409 });
  }

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key.startsWith('sk_test_XXXX')) {
    return NextResponse.json({ error: 'Stripe no configurado' }, { status: 503 });
  }
  const stripe = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });
  const cuenta = studio.stripe_account_id as string;

  const piId = await resolverPaymentIntent(stripe, cuenta, recibo.stripe_payment_intent_id as string | null, recibo.id as string);
  if (!piId) {
    // Pasa con los recibos ANTERIORES a este cambio: hasta ahora el id del
    // cargo solo se guardaba en la rama SEPA, así que un cobro con tarjeta o
    // una compra web no dejaban rastro. No es un error del estudio y el mensaje
    // no debe sonar a fallo suyo.
    return NextResponse.json({
      error: 'No encontramos el cobro de este recibo en Stripe, así que no se puede devolver desde aquí. '
        + 'Búscalo en Stripe por el importe y la fecha y devuélvelo allí: Tentare lo detectará igual y '
        + 'te ofrecerá quitar el bono.',
      motivo: 'SIN_RASTRO_STRIPE',
    }, { status: 409 });
  }

  try {
    // Hay que preguntarle a Stripe si este cobro llevó comisión de plataforma
    // ANTES de pedir el reembolso: mandar `refund_application_fee` cuando no la
    // hay no se ignora, da error y tumba la devolución entera (pasó con la
    // primera devolución real, 11-ago-2026 — ver lib/billing/reembolso-params.ts).
    const pi = await stripe.paymentIntents.retrieve(piId, {}, { stripeAccount: cuenta });
    const refund = await stripe.refunds.create(
      paramsReembolso(piId, pi.application_fee_amount),
      {
        stripeAccount: cuenta,
        // Doble clic, doble pestaña, o el mismo mostrador dos veces: sin esto
        // son dos devoluciones del mismo dinero. Por recibo, que es lo que se
        // devuelve.
        //
        // El `-v2` no es decorativo: Stripe guarda el resultado de una clave de
        // idempotencia AUNQUE la respuesta fuera un error, así que las claves
        // de los intentos que murieron por el fallo de arriba devolverían ese
        // mismo error para siempre. Si alguna vez vuelve a cambiar la FORMA de
        // esta petición, sube el número.
        idempotencyKey: `reembolso-v2-${recibo.id}`,
      },
    );

    // Sigue sin marcarse el recibo DEVUELTO aquí — eso lo hace el webhook de
    // `charge.refunded`, igual que con un reembolso hecho desde Stripe. Lo que
    // se anota es otra cosa: que Tentare lo PIDIÓ. Con esto puesto y el estado
    // todavía COBRADO, la pantalla puede decir "devolviendo…" en vez de no
    // decir nada, y si el webhook nunca llega se ve que quedó a medias en vez
    // de parecer que no pasó (el patrón que costó el cobro perdido del 8-ago).
    //
    // Best-effort a propósito: el dinero YA ha salido. Si esta escritura falla,
    // lo último que hay que hacer es responder error y que alguien lo reintente.
    const { error: errMarca } = await admin.from('recibos').update({
      reembolso_solicitado_en: new Date().toISOString(),
      reembolso_stripe_id: refund.id,
    }).eq('id', recibo.id).eq('studio_id', sesion.studioId);
    if (errMarca) {
      Sentry.captureMessage('[reembolsos] devolución hecha pero sin marcar como solicitada', {
        level: 'warning', tags: { area: 'cobros', tipo: 'reembolso' },
        extra: { reciboId: recibo.id, refundId: refund.id, error: errMarca.message },
      });
    }

    return NextResponse.json({ ok: true, refundId: refund.id, estado: refund.status });
  } catch (err) {
    const esStripe = err instanceof Stripe.errors.StripeError;
    // `charge_already_refunded`: alguien lo devolvió desde Stripe entre que se
    // pintó la pantalla y se pulsó el botón. No es un fallo que reportar.
    if (esStripe && (err as Stripe.errors.StripeError).code === 'charge_already_refunded') {
      return NextResponse.json({ error: 'Este cobro ya estaba devuelto en Stripe.' }, { status: 409 });
    }
    Sentry.captureException(err instanceof Error ? err : new Error('Fallo al devolver'), {
      level: 'error', tags: { area: 'cobros', tipo: 'reembolso' },
      extra: { reciboId: recibo.id, studioId: sesion.studioId, paymentIntentId: piId },
    });
    return NextResponse.json({
      // El mensaje de Stripe es para el log, no para quien está en el mostrador.
      error: 'No se pudo completar la devolución. Vuelve a intentarlo; si sigue fallando, hazla desde Stripe.',
    }, { status: 502 });
  }
}

/**
 * El id del cargo a devolver.
 *
 * Primero la columna. Si está vacía —todos los recibos anteriores a este
 * cambio, porque solo la rama SEPA la rellenaba— se busca en Stripe por
 * `metadata.reciboId`, que sí sellan `cobrarReciboOffSession` (al crear el PI)
 * y el conciliador (después de entregar una compra web).
 *
 * La búsqueda va acotada a la cuenta del estudio, así que no puede alcanzar el
 * cobro de otro. Y si encuentra el PI, se guarda para no repetirla nunca más.
 */
async function resolverPaymentIntent(
  stripe: Stripe,
  cuenta: string,
  guardado: string | null,
  reciboId: string,
): Promise<string | null> {
  if (guardado) return guardado;
  try {
    const res = await stripe.paymentIntents.search(
      { query: `metadata['reciboId']:'${reciboId}'`, limit: 2 },
      { stripeAccount: cuenta },
    );
    // Más de uno = un reintento de cobro dejó dos PaymentIntents con el mismo
    // reciboId. Cuál devolver no lo puede decidir un servidor a ciegas.
    if (res.data.length !== 1) return null;
    const pi = res.data[0];
    if (pi.status !== 'succeeded') return null;
    const admin = getSupabaseAdmin();
    if (admin) {
      await admin.from('recibos').update({ stripe_payment_intent_id: pi.id }).eq('id', reciboId);
    }
    return pi.id;
  } catch {
    // El índice de búsqueda de Stripe tarda ~1 min en ver un objeto nuevo, y
    // puede fallar. No es motivo para romper: se responde "sin rastro" y el
    // estudio lo devuelve desde Stripe.
    return null;
  }
}
