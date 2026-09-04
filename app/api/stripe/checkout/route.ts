import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { applicationFeeAmount } from '@/lib/billing/stripe-fees';
import { comprobarModoStripe } from '@/lib/billing/modo-stripe';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import { parsearOrigenPago, urlsDeRetorno } from '@/lib/billing/origen-pago';
import { respuestaPreflightWidget, conCorsWidget } from '@/lib/cors-widget';
import { decidirSesionCheckout } from '@/lib/billing/sesion-checkout';
import { claveCheckoutPlanModoA } from '@/lib/billing/clave-checkout-embebido';
import { resolverDescuentoCheckout } from '@/lib/billing/descuento-checkout';
import { esSociaNueva } from '@/lib/billing/socia-nueva';
import { mapCodigoDescuento } from '@/lib/supabase-data';
import type { RowCodigosDescuento } from '@/lib/db-types';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { socioAutenticado } from '@/lib/db/supabase-data-admin';
import { bloqueoPorSuscripcion } from '@/lib/billing/billing-guard';

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
    // Auditoría vs Momence (#canje-codigos-descuento-checkout): texto tal
    // cual lo escribe la socia. Solo aplica a compra de plan (body.planId),
    // nunca al cobro de un recibo ya generado — el importe de un recibo
    // viene fijado por reglas de facturación anteriores, no de marketing.
    codigoDescuento?: string;
  } | null;

  if (!body?.studioId) {
    return conCorsWidget(req, NextResponse.json({ error: 'Falta el estudio' }, { status: 400 }));
  }

  // F-30 (auditoría 20ª pasada): esta es la OTRA puerta por la que entra
  // dinero (la socia paga desde el portal o un enlace público, sin sesión de
  // staff) — el guardia de suscripción ya protegía charge-off-session,
  // pos-bizum, terminal/cobrar y reembolsos, pero no esta ni
  // /api/public/checkout-embebido: un estudio con la suscripción a Tentare
  // caducada seguía cobrando a sus socias por enlace público y widget.
  const bloqueo = await bloqueoPorSuscripcion(body.studioId);
  if (bloqueo) return conCorsWidget(req, bloqueo);

  // El importe y el concepto se resuelven contra la BD, validando pertenencia
  // al estudio. metadata.socioId lo lee el webhook para guardar la tarjeta;
  // metadata.reciboId solo se pone para pagos de un recibo real (así el
  // webhook no intenta marcar como cobrado un recibo inexistente).
  let importe: number;
  let concepto: string;
  // ⚠️ El `socioId` NUNCA se toma del body a pelo (auditoría 21/22-ago, C-1).
  // Antes era `body.socioId ?? null` sin comprobar nada: pagando con tarjeta
  // propia se podía escribir bono/recibo/suscripción a nombre de OTRA socia
  // —incluso de otro estudio— y sobrescribir su método de pago guardado, con
  // lo que los cobros off-session posteriores irían a la tarjeta del
  // atacante. `suscripciones_socio_id_fkey` es una FK simple a `socios(id)`,
  // no compuesta con `studio_id`, así que la BD tampoco lo impedía.
  // En la rama de RECIBO no hace falta: `socioId` sale de la fila del recibo
  // dos bloques más abajo, nunca del body. Solo la rama de PLAN confiaba en
  // el valor crudo — ahí se exige el Bearer del portal (ver más abajo).
  let socioId: string | null = null;
  // Sesión de Checkout que este recibo ya tenga abierta (migr 20260817214500).
  // Es lo que impide crear una SEGUNDA sesión pagable del mismo recibo.
  let sesionAbiertaId: string | null = null;
  const metadata: Record<string, string> = { studioId: body.studioId };

  if (body.reciboId) {
    const { data: recibo, error } = await admin
      .from('recibos')
      .select('importe, concepto, estado, studio_id, socio_id, checkout_session_id')
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
    sesionAbiertaId = (recibo.checkout_session_id as string | null) ?? null;
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
    // La identidad de la socia sale del JWT verificado, nunca del body — mismo
    // criterio que /api/public/checkout-embebido (auditoría 19-ago, c5539af3).
    // Sin socioId es el camino de invitada (compra sin ficha, más abajo).
    if (body.socioId) {
      const usuario = await verificarUsuarioSupabase(req);
      if (!usuario) {
        return conCorsWidget(req, NextResponse.json({ error: 'Inicia sesión para comprar.' }, { status: 401 }));
      }
      socioId = await socioAutenticado(usuario.userId, body.studioId);
      if (!socioId) {
        return conCorsWidget(req, NextResponse.json({ error: 'No autorizado' }, { status: 403 }));
      }
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

    // Auditoría vs Momence: canje de código de descuento, solo en compra de
    // plan. El servidor SIEMPRE recalcula — el texto del código es lo único
    // que viaja del cliente, el importe final sale de aquí, nunca del body.
    // Un código inválido/caducado/agotado no bloquea la compra: se ignora en
    // silencio y se cobra el precio de catálogo (mismo criterio que el POS
    // congelado, que tampoco impedía la venta por un código malo).
    if (body.codigoDescuento) {
      const { data: codigosRaw } = await admin
        .from('codigos_descuento')
        .select('*')
        .eq('studio_id', body.studioId);
      const codigos = (codigosRaw ?? []).map(r => mapCodigoDescuento(r as RowCodigosDescuento));
      const resultado = resolverDescuentoCheckout(codigos, body.codigoDescuento, {
        hoyISO: new Date().toISOString(),
        subtotal: importe,
        esNueva: await esSociaNueva(admin, body.studioId, socioId, body.socioEmail),
      });
      if (resultado.ok) {
        importe = Math.max(0, Math.round((importe - resultado.descuento) * 100) / 100);
        const codigoAplicado = codigos.find(c => c.codigo.trim().toUpperCase() === body.codigoDescuento!.trim().toUpperCase());
        if (codigoAplicado) metadata.codigoDescuentoId = codigoAplicado.id;
      }
    }
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
  // arrastra una opción que no soporta. Ver el webhook
  // (`checkout.session.completed`), que comprueba el método REALMENTE usado
  // antes de guardar nada.
  //
  // ⚠️ El `setup_future_usage` GLOBAL se sigue pidiendo cuando no hay Bizum,
  // aunque el por-método ya lo cubriría. No es redundancia por descuido:
  //
  //   · El camino sin Bizum (portal, panel, /reservar, enlace de pago) YA
  //     funcionaba con el global, y el webhook comprobaba justo ese campo.
  //   · Dejar solo el por-método haría que ese camino que funciona dependa de
  //     que Stripe devuelva `payment_method_options.card.setup_future_usage` en
  //     el PaymentIntent recuperado. Es lo esperable, pero aquí no hay Stripe en
  //     modo test para comprobarlo, y si no lo devolviera se dejarían de guardar
  //     tarjetas en el único camino por el que hoy se guardan.
  //
  // Con Bizum sí va solo el por-método: el global es incompatible con `bizum` y
  // Stripe rechazaría la sesión. Así el camino nuevo gana capacidad sin poner en
  // riesgo el que ya iba, y `metodoReutilizableDe` acepta las dos formas.
  const conBizum = body.bizum === true;
  const paymentMethodTypes: Array<'card' | 'bizum'> = conBizum ? ['card', 'bizum'] : ['card'];

  // DOBLE COBRO (C-3). Hasta aquí esto solo LEÍA el estado del recibo y creaba
  // la sesión sin escribir nada: un TOCTOU de manual. Dos pestañas —o dos clics
  // separados por minutos— producían DOS sesiones pagables del mismo recibo, y
  // las dos cobraban de verdad. El segundo cargo era además invisible: el
  // webhook lo acota con `.in('estado', [...])`, así que casaba 0 filas y no
  // dejaba rastro en ninguna parte de Tentare.
  //
  // Se reutiliza la sesión que ya esté abierta en vez de crear otra (y de paso
  // la socia recupera su checkout, que es mejor que un error). Si pide otro
  // método de pago, la anterior se EXPIRA antes de crear la nueva: expirada ya
  // no se puede pagar, así que nunca hay dos sesiones cobrables vivas a la vez.
  if (sesionAbiertaId) {
    try {
      const previa = await stripe.checkout.sessions.retrieve(
        sesionAbiertaId,
        undefined,
        { stripeAccount: studio.stripe_account_id },
      );
      const decision = decidirSesionCheckout(previa, paymentMethodTypes);
      if (decision === 'reutilizar' && previa.url) {
        return conCorsWidget(req, NextResponse.json({ url: previa.url }));
      }
      if (decision === 'expirar-y-crear') {
        await stripe.checkout.sessions.expire(
          sesionAbiertaId,
          undefined,
          { stripeAccount: studio.stripe_account_id },
        );
      }
    } catch (err) {
      // La sesión guardada ya no se puede consultar (borrada, cuenta cambiada,
      // Stripe caído). No es motivo para impedir el pago: se sigue y se crea
      // una nueva. El peor caso es exactamente el comportamiento de antes.
      console.error('[stripe/checkout] no se pudo revisar la sesión previa', sesionAbiertaId, err);
    }
  }

  // D-3 (auditoría 20-ago): clave de idempotencia también para la compra de
  // PLAN. Antes existía solo para recibos y dos pestañas del mismo intento eran
  // dos `cs_` pagables → dos cargos, dos recibos COBRADOS y dos suscripciones,
  // sin que nada lo detectara. Misma regla que el checkout embebido (Modo B),
  // con prefijo y componentes propios — el porqué de cada diferencia está en
  // `lib/billing/clave-checkout-embebido.ts`. Devuelve null sin identidad
  // (endpoint semipúblico, el email no está garantizado): en ese caso se queda
  // el comportamiento de antes en vez de arriesgar una colisión entre personas.
  const clavePlan = !body.reciboId && body.planId
    ? claveCheckoutPlanModoA({
        studioId: body.studioId,
        planId: body.planId,
        socioId,
        socioEmail: body.socioEmail ?? null,
        codigoDescuentoId: metadata.codigoDescuentoId ?? null,
        metodos: paymentMethodTypes,
      })
    : null;

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
      // Guardado POR MÉTODO: la tarjeta sí, Bizum no lo admite. Es lo que
      // permite ofrecer Bizum y seguir pudiendo cobrar después.
      payment_method_options: { card: { setup_future_usage: 'off_session' as const } },
      payment_intent_data: {
        // Y el global cuando no hay Bizum, para no cambiar en nada el camino que
        // ya funcionaba (ver el comentario largo más arriba).
        ...(conBizum ? {} : { setup_future_usage: 'off_session' as const }),
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
    }, {
      stripeAccount: studio.stripe_account_id,
      // Cinturón además de los tirantes: la reutilización de arriba no cubre la
      // carrera de dos peticiones que entran ANTES de que ninguna haya llegado a
      // guardar `checkout_session_id`. Con la misma clave, Stripe devuelve la
      // sesión que ya creó en vez de crear otra. Lleva los métodos de pago
      // porque cambiarlos sí exige una sesión distinta, y con la misma clave y
      // parámetros distintos Stripe respondería un error de idempotencia.
      //
      // Para la compra de un plan, `clavePlan` (D-3): la afirmación que vivía
      // aquí —"no hay un id estable con el que construir una clave que no
      // colisione entre personas"— dejó de ser cierta cuando el Modo B lo
      // resolvió identificando el INTENTO (persona hasheada + plan + descuento
      // + ventana), y quedó sin aplicar en este camino.
      ...(body.reciboId
        ? { idempotencyKey: `checkout-${body.reciboId}-${[...paymentMethodTypes].sort().join('-')}` }
        : clavePlan
          ? { idempotencyKey: clavePlan }
          : {}),
    });

    // Se registra ANTES de devolver la URL. Si esto fallara y devolviéramos la
    // sesión igualmente, quedaría una sesión pagable que Tentare no conoce — y
    // la siguiente petición crearía otra: exactamente el bug que cierra esto.
    // Regla de la casa: cero escritura optimista en el camino del dinero.
    if (body.reciboId) {
      const { error: errGuardar } = await admin
        .from('recibos')
        .update({ checkout_session_id: session.id })
        .eq('id', body.reciboId)
        .eq('studio_id', body.studioId);
      if (errGuardar) {
        console.error('[stripe/checkout] no se pudo registrar la sesión', session.id, errGuardar);
        await stripe.checkout.sessions
          .expire(session.id, undefined, { stripeAccount: studio.stripe_account_id })
          .catch(() => { /* si ni siquiera se puede expirar, el aviso de arriba es el rastro */ });
        return conCorsWidget(req, NextResponse.json(
          { error: 'No se pudo iniciar el cobro. Inténtalo de nuevo.' },
          { status: 500 },
        ));
      }
    }

    return conCorsWidget(req, NextResponse.json({ url: session.url }));
  } catch (err) {
    return conCorsWidget(req, errorInterno('stripe/checkout:POST', err, 'No se pudo iniciar el cobro. Inténtalo de nuevo más tarde.'));
  }
}
