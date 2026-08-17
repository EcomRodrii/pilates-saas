import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { applicationFeeAmount } from '@/lib/billing/stripe-fees';
import { comprobarModoStripe } from '@/lib/billing/modo-stripe';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import { parsearOrigenPago, urlsDeRetorno } from '@/lib/billing/origen-pago';
import { respuestaPreflightWidget, conCorsWidget } from '@/lib/cors-widget';

// Inicia un pago con Stripe Checkout sobre la cuenta conectada del estudio
// (direct charge: el importe va a la cuenta del estudio; la plataforma recauda
// el take-rate vía application_fee_amount cuando está activo — lib/stripe-fees).
//
// SEGURIDAD: el importe y el concepto se derivan SIEMPRE de la base de datos
// —del recibo pendiente, o del plan de tarifa—, NUNCA del cuerpo de la
// petición. Antes el cliente enviaba `importe`, así que cualquiera podía pedir
// un checkout de 0,01 € para un recibo de 85 € (o para un recibo de otro
// estudio) y el webhook lo daría por COBRADO. Este endpoint es semipúblico por
// diseño (una socia paga desde /reservar sin sesión de staff), por eso la
// defensa correcta es validar el importe en el servidor, no exigir login de
// staff. Se comprueba además que el recibo/plan pertenezca al `studioId`.
//
// CORS (Fase 3 Booking Engine): el fallback de Bizum del checkout embebido
// (Modo B, `components/checkout-widget/checkout-embebido.tsx`) llama a este
// MISMO endpoint desde el dominio del estudio — con `?studioId=` en la URL
// para que el preflight resuelva la lista blanca. `conCorsWidget` no añade
// cabeceras si el Origin no coincide con `widget_dominios_autorizados`, y no
// afecta a las llamadas same-origin ya existentes de Modo A.
export async function OPTIONS(req: NextRequest) {
  return respuestaPreflightWidget(req);
}

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'stripe-checkout', { max: 10, windowSeconds: 60 });
  if (limited) return limited;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key.startsWith('sk_test_XXXX')) {
    return conCorsWidget(req, NextResponse.json({ error: 'Stripe no configurado. Añade STRIPE_SECRET_KEY en .env.local' }, { status: 503 }));
  }
  // La otra puerta por la que entra dinero (la socia paga desde el portal o un
  // enlace). Mismo guardia que el cobro automático: con el `.env.local` de
  // producción copiado a una máquina, esta ruta abriría un checkout que cobra
  // de verdad. Ver lib/billing/modo-stripe.ts.
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
    reciboId?: string;
    planId?: string;
    socioId?: string | null;
    socioEmail?: string | null;
    socioNombre?: string;
    // Desde dónde se paga. Decide a qué pantalla devuelve Stripe, y NADA más:
    // es una etiqueta de una lista blanca, nunca una URL (ver origen-pago.ts).
    origen?: string;
    // Pagos España (PR-5): ofrecer Bizum además de tarjeta en pagos PUNTUALES
    // (clase suelta / bono / primer pago). Bizum no es recurrente ni guardable,
    // así que activarlo desactiva el guardado de tarjeta (setup_future_usage).
    bizum?: boolean;
    // P1 auditoría Momence: lead-id crudo del widget público (`?ref=`),
    // viaja en la metadata de Stripe hasta entregarPlanComprado.
    origenLead?: string | null;
  } | null;

  if (!body?.studioId) {
    return conCorsWidget(req, NextResponse.json({ error: 'Falta el estudio' }, { status: 400 }));
  }

  // El importe y el concepto se resuelven contra la BD, validando pertenencia
  // al estudio. metadata.socioId lo lee el webhook para guardar la tarjeta;
  // metadata.reciboId solo se pone para pagos de un recibo real (así el
  // webhook no intenta marcar como cobrado un recibo inexistente).
  let importe: number;
  let concepto: string;
  let socioId: string | null = body.socioId ?? null;
  const metadata: Record<string, string> = { studioId: body.studioId };

  if (body.reciboId) {
    const { data: recibo, error } = await admin
      .from('recibos')
      .select('importe, concepto, estado, studio_id, socio_id')
      .eq('id', body.reciboId)
      .maybeSingle();
    if (error || !recibo) {
      return conCorsWidget(req, NextResponse.json({ error: 'Recibo no encontrado' }, { status: 404 }));
    }
    if (recibo.studio_id !== body.studioId) {
      return conCorsWidget(req, NextResponse.json({ error: 'Ese recibo no pertenece a este estudio' }, { status: 403 }));
    }
    if (recibo.estado !== 'PENDIENTE') {
      return conCorsWidget(req, NextResponse.json({ error: 'Este recibo ya no está pendiente de cobro' }, { status: 409 }));
    }
    importe = Number(recibo.importe);
    concepto = recibo.concepto;
    socioId = recibo.socio_id ?? socioId;
    metadata.reciboId = body.reciboId;
  } else if (body.planId) {
    const { data: plan, error } = await admin
      .from('planes_tarifa')
      .select('nombre, precio, studio_id, activo')
      .eq('id', body.planId)
      .maybeSingle();
    if (error || !plan) {
      return conCorsWidget(req, NextResponse.json({ error: 'Plan no encontrado' }, { status: 404 }));
    }
    if (plan.studio_id !== body.studioId) {
      return conCorsWidget(req, NextResponse.json({ error: 'Ese plan no pertenece a este estudio' }, { status: 403 }));
    }
    if (!plan.activo) {
      return conCorsWidget(req, NextResponse.json({ error: 'Ese plan ya no está disponible' }, { status: 409 }));
    }
    // Comprar un plan sin ficha: decide el estudio (0110). En EXIGIR_REGISTRO
    // no se cobra a quien no se ha registrado — sin ficha no hay contrato
    // aceptado, así que cobrar antes sería cobrar sin consentimiento.
    if (!socioId) {
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
    importe = Number(plan.precio);
    concepto = plan.nombre;
    metadata.planId = body.planId;
  } else {
    return conCorsWidget(req, NextResponse.json({ error: 'Falta el recibo o el plan a cobrar' }, { status: 400 }));
  }

  if (!(importe > 0)) {
    return conCorsWidget(req, NextResponse.json({ error: 'Importe no válido' }, { status: 409 }));
  }
  if (socioId) metadata.socioId = socioId;
  // Stripe exige valores de metadata como string no vacío.
  if (body.origenLead) metadata.origenLead = body.origenLead;

  const { data: studio } = await admin
    .from('studios')
    .select('stripe_account_id, slug')
    .eq('id', body.studioId)
    .single();
  if (!studio?.stripe_account_id) {
    return conCorsWidget(req, NextResponse.json({ error: 'Conecta tu cuenta de Stripe desde Configuración → Integraciones antes de cobrar.' }, { status: 409 }));
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
  const slugEstudio = studio.slug as string | null;
  const retorno = urlsDeRetorno({
    origen: parsearOrigenPago(body.origen),
    appUrl,
    slug: slugEstudio,
    esCompraDePlan: !!body.planId && !body.reciboId,
    reciboId: body.reciboId,
    planId: body.planId,
  });

  // R2: take-rate de plataforma (apagado por defecto; ver lib/billing/stripe-fees.ts).
  const fee = applicationFeeAmount(Math.round(importe * 100));

  // Bizum no admite `setup_future_usage` (es un pago puntual sin mandato
  // reutilizable), así que durante un tiempo pedir Bizum apagaba el guardado de
  // tarjeta de TODA la sesión — incluido `customer_creation`. El problema es que
  // esa sesión sigue ofreciendo tarjeta: el botón "Pagar con Bizum" del widget
  // manda `bizum: true`, y una socia que allí acabara pagando CON TARJETA no
  // dejaba ni Customer ni PaymentMethod. Después, "Cobrar online" en el panel
  // solo podía decir "La socia no tiene tarjeta ni mandato SEPA guardado".
  //
  // `payment_method_options.card.setup_future_usage` resuelve exactamente esto:
  // el guardado se pide POR MÉTODO, así que la tarjeta se guarda y Bizum no
  // arrastra una opción que no soporta. El `setup_future_usage` global se deja
  // de pedir: uno por método vale para los dos casos y evita tener dos formas
  // de decir lo mismo. Ver el webhook (`checkout.session.completed`), que
  // comprueba el método REALMENTE usado antes de guardar nada.
  const conBizum = body.bizum === true;
  const paymentMethodTypes: Array<'card' | 'bizum'> = conBizum ? ['card', 'bizum'] : ['card'];

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: paymentMethodTypes,
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: concepto,
              description: body.socioNombre ? `Tentare · ${body.socioNombre}` : 'Tentare',
            },
            unit_amount: Math.round(importe * 100),
          },
          quantity: 1,
        },
      ],
      customer_email: body.socioEmail ?? undefined,
      // Siempre: sin Customer no hay dónde adjuntar la tarjeta, y esto vale
      // igual cuando se paga por Bizum (el Customer se queda sin método
      // reutilizable, que es lo correcto, en vez de no existir).
      customer_creation: 'always' as const,
      // Guardado POR MÉTODO: la tarjeta sí, Bizum no lo admite. Sustituye al
      // `setup_future_usage` global, que obligaba a elegir entre ofrecer Bizum
      // y poder volver a cobrar (ver el comentario largo más arriba).
      payment_method_options: { card: { setup_future_usage: 'off_session' as const } },
      payment_intent_data: {
        ...(fee !== undefined ? { application_fee_amount: fee } : {}),
        // El handler `charge.refunded` lee la metadata del PAYMENT INTENT, no de la
        // session (Stripe no la copia). Sin el reciboId aquí, una devolución o
        // contracargo de un pago por enlace/Bizum NO marcaba el recibo DEVUELTO y se
        // quedaba COBRADO para siempre (ingresos inflados). Solo para recibos reales.
        ...(body.reciboId ? { metadata: { reciboId: body.reciboId, origen: 'tarjeta_recibo', studioId: body.studioId } } : {}),
      },
      metadata,
      // A dónde vuelve la persona: lo resuelve `urlsDeRetorno` a partir de
      // `origen` (lista blanca) + si es compra de plan. Antes esto asumía que
      // todo lo que llevara `reciboId` lo iniciaba el estudio desde su panel, y
      // dejaba a la socia que paga desde el portal en el login del staff.
      success_url: retorno.successUrl,
      cancel_url: retorno.cancelUrl,
      locale: 'es',
    }, { stripeAccount: studio.stripe_account_id });

    return conCorsWidget(req, NextResponse.json({ url: session.url }));
  } catch (err) {
    return conCorsWidget(req, errorInterno('stripe/checkout:POST', err, 'No se pudo iniciar el cobro. Inténtalo de nuevo más tarde.'));
  }
}
