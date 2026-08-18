import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { applicationFeeAmount } from '@/lib/billing/stripe-fees';
import { comprobarModoStripe } from '@/lib/billing/modo-stripe';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import { respuestaPreflightWidget, conCorsWidget } from '@/lib/cors-widget';

// Fase 3 del "Booking Experience Engine" — checkout embebido dentro del widget
// (Modo B): sustituye `stripe.checkout.sessions.create()` (redirect de página
// completa) por un PaymentIntent que el cliente confirma en el propio Shadow
// Root con Stripe Elements (`@stripe/react-stripe-js`, componente aparte).
// Diseño completo: docs/checkout-embebido-diseno.md.
//
// SEGURIDAD: mismo criterio que app/api/stripe/checkout/route.ts (§1 del
// diseño) — el importe y el concepto SIEMPRE se leen del plan en servidor,
// NUNCA del body. Solo compra de PLAN (body.planId); el cobro de un recibo
// pendiente sigue viviendo en Checkout Session, sin tocar (§8 del diseño).
//
// CORS: el bundle embebible llama desde el dominio del ESTUDIO. El preflight
// no lleva body, así que ?studioId= o ?slug= tienen que ir en la query.
export async function OPTIONS(req: NextRequest) {
  return respuestaPreflightWidget(req);
}

/** Ventana de un minuto para la clave de idempotencia — ver §1/§9.4 del diseño. */
function ventanaMinuto(): number {
  return Math.floor(Date.now() / 60000);
}

export async function POST(req: NextRequest) {
  // Bucket dedicado, no 'stripe-checkout': un checkout embebido tiene más idas
  // y vueltas por el mismo intento legítimo (crear intent → posible reintento
  // de 3DS → posible cambio de método sin recargar) que "un click, una
  // sesión". Ver §7 del diseño.
  const limited = await enforceRateLimit(req, 'checkout-embebido', { max: 15, windowSeconds: 120 });
  if (limited) return limited;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key.startsWith('sk_test_XXXX')) {
    return conCorsWidget(req, NextResponse.json({ error: 'Stripe no configurado. Añade STRIPE_SECRET_KEY en .env.local' }, { status: 503 }));
  }
  // La sexta puerta por la que entra dinero. Ver lib/billing/modo-stripe.ts.
  const modo = comprobarModoStripe();
  if (!modo.puedeCobrar) {
    return conCorsWidget(req, NextResponse.json({ error: modo.motivo }, { status: 503 }));
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return conCorsWidget(req, NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 }));
  }

  const stripe = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });

  const body = await req.json().catch(() => null) as {
    studioId?: string;
    planId?: string;
    socioId?: string | null;
    socioEmail?: string | null;
    socioNombre?: string;
    origenLead?: string | null;
    // NUEVO — "pagar y reservar sin login previo" (docs/reserva-sin-login-diseno.md
    // §4.1): la clase que se quiere reservar en cuanto el pago se confirme.
    // Nunca decide el importe (siempre viene de plan.precio abajo) — solo
    // marca qué reservar después.
    sesionId?: string;
  } | null;

  if (!body?.studioId) {
    return conCorsWidget(req, NextResponse.json({ error: 'Falta el estudio' }, { status: 400 }));
  }
  if (!body.planId) {
    return conCorsWidget(req, NextResponse.json({ error: 'Falta el plan a comprar' }, { status: 400 }));
  }

  const { data: plan, error: errPlan } = await admin
    .from('planes_tarifa')
    .select('nombre, precio, studio_id, activo')
    .eq('id', body.planId)
    .maybeSingle();
  if (errPlan || !plan) {
    return conCorsWidget(req, NextResponse.json({ error: 'Plan no encontrado' }, { status: 404 }));
  }
  if (plan.studio_id !== body.studioId) {
    return conCorsWidget(req, NextResponse.json({ error: 'Ese plan no pertenece a este estudio' }, { status: 403 }));
  }
  if (!plan.activo) {
    return conCorsWidget(req, NextResponse.json({ error: 'Ese plan ya no está disponible' }, { status: 409 }));
  }

  const socioId = body.socioId ?? null;
  // Comprar un plan sin ficha: decide el estudio (0110). En EXIGIR_REGISTRO no
  // se cobra a quien no se ha registrado — sin ficha no hay contrato aceptado,
  // así que cobrar antes sería cobrar sin consentimiento.
  //
  // EXCEPCIÓN deliberada, "pagar y reservar sin login previo"
  // (docs/reserva-sin-login-diseno.md §4.1/§8): con `sesionId`, esto YA NO es
  // "compra cualquier bono de forma anónima" (lo que `compra_publica_modo`
  // decide) — es "paga esta clase concreta", el flujo que el fundador pidió
  // que SIEMPRE esté disponible sin registro previo, sea cual sea el ajuste
  // del estudio. Mismo criterio de consentimiento diferido que ya usa
  // CREAR_FICHA: `entregarPlanComprado` crea la ficha SIN `aceptacionContrato`
  // a propósito, y el portal lo pide en la primera visita — no es una excepción
  // nueva al criterio de consentimiento, es el mismo camino que CREAR_FICHA ya
  // ofrecía, ahora incondicional para este caso concreto.
  if (!socioId && !body.sesionId) {
    const { data: cfg } = await admin
      .from('studios')
      .select('compra_publica_modo')
      .eq('id', body.studioId)
      .maybeSingle();
    if ((cfg?.compra_publica_modo ?? 'EXIGIR_REGISTRO') === 'EXIGIR_REGISTRO') {
      return conCorsWidget(req, NextResponse.json(
        { error: 'Regístrate antes de comprar: te pedimos el email y aceptar las condiciones.', necesitaRegistro: true },
        { status: 409 },
      ));
    }
  }

  const importe = Number(plan.precio);
  if (!(importe > 0)) {
    return conCorsWidget(req, NextResponse.json({ error: 'Importe no válido' }, { status: 409 }));
  }

  // "Pagar y reservar sin login previo" (docs/reserva-sin-login-diseno.md §4.1):
  // si viene sesionId, comprobar que la clase sigue viva y que el plan la
  // cubre ANTES de generar una intención de cobro — pagar por una clase que
  // ya no se puede reservar sería cobrar sin poder entregar nada.
  if (body.sesionId) {
    // Sin socioId (visitante nueva) hace falta email para poder crear la
    // ficha/cuenta después del pago — sin él, entregarPlanComprado no tiene a
    // quién entregarle nada (mismo motivo que 'sin-socia' en ese módulo).
    if (!socioId && !body.socioEmail) {
      return conCorsWidget(req, NextResponse.json({ error: 'Falta el email' }, { status: 400 }));
    }
    const { data: sesion } = await admin
      .from('sesiones').select('inicio, cancelada, tipo_clase_id')
      .eq('id', body.sesionId).eq('studio_id', body.studioId).maybeSingle();
    if (!sesion) return conCorsWidget(req, NextResponse.json({ error: 'Clase no encontrada' }, { status: 404 }));
    if (sesion.cancelada) return conCorsWidget(req, NextResponse.json({ error: 'Esta clase está cancelada' }, { status: 409 }));
    if (new Date(sesion.inicio as string).getTime() <= Date.now()) {
      return conCorsWidget(req, NextResponse.json({ error: 'Esta clase ya ha empezado' }, { status: 409 }));
    }
    const { data: tiposDelPlan } = await admin
      .from('plan_tipos_clase').select('tipo_clase_id').eq('plan_id', body.planId);
    // Sin filas = el plan cubre TODOS los tipos (mismo criterio que
    // hidratarTiposDePlanes/tieneEntitlementActivo en el resto del repo).
    if (tiposDelPlan && tiposDelPlan.length > 0 && !tiposDelPlan.some(t => t.tipo_clase_id === sesion.tipo_clase_id)) {
      return conCorsWidget(req, NextResponse.json({ error: 'Este plan no cubre el tipo de esta clase' }, { status: 400 }));
    }
  }

  const { data: studio } = await admin
    .from('studios')
    .select('stripe_account_id')
    .eq('id', body.studioId)
    .maybeSingle();
  if (!studio?.stripe_account_id) {
    return conCorsWidget(req, NextResponse.json({ error: 'Conecta tu cuenta de Stripe desde Configuración → Integraciones antes de cobrar.' }, { status: 409 }));
  }

  const amountCentimos = Math.round(importe * 100);
  const fee = applicationFeeAmount(amountCentimos);

  const metadata: Record<string, string> = {
    studioId: body.studioId,
    planId: body.planId,
    origen: 'plan_web_embebido',
  };
  if (socioId) metadata.socioId = socioId;
  // Stripe exige valores de metadata como string no vacío.
  if (body.origenLead) metadata.origenLead = body.origenLead;
  if (body.socioEmail) metadata.socioEmail = body.socioEmail;
  if (body.socioNombre) metadata.socioNombre = body.socioNombre;
  if (body.sesionId) metadata.sesionId = body.sesionId;

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCentimos,
      currency: 'eur',
      // Explícito, no automatic_payment_methods: Bizum exige salir del widget
      // (acción externa en la app del banco) y se ofrece aparte, con redirect
      // avisado (§4 del diseño) — nunca dentro del Payment Element.
      payment_method_types: ['card'],
      setup_future_usage: 'off_session',
      receipt_email: body.socioEmail ?? undefined,
      description: plan.nombre,
      ...(fee !== undefined ? { application_fee_amount: fee } : {}),
      metadata,
    }, {
      stripeAccount: studio.stripe_account_id,
      // Mejora respecto al camino existente (Checkout Session no la lleva):
      // dos pestañas del mismo intento legítimo no generan dos PaymentIntents
      // cobrables — ver §1/§9.4 del diseño.
      idempotencyKey: `checkout-embebido-${body.studioId}-${body.planId}-${socioId ?? 'guest'}-${ventanaMinuto()}`,
    });

    return conCorsWidget(req, NextResponse.json({ clientSecret: paymentIntent.client_secret }));
  } catch (err) {
    return conCorsWidget(req, errorInterno('public/checkout-embebido:POST', err, 'No se pudo iniciar el cobro. Inténtalo de nuevo más tarde.'));
  }
}
