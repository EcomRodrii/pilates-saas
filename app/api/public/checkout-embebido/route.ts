import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { applicationFeeAmount } from '@/lib/billing/stripe-fees';
import { comprobarModoStripe } from '@/lib/billing/modo-stripe';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import { respuestaPreflightWidget, conCorsWidget } from '@/lib/cors-widget';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { socioAutenticado } from '@/lib/db/supabase-data-admin';
import { claveCheckoutEmbebido } from '@/lib/billing/clave-checkout-embebido';
import { resolverDescuentoCheckout } from '@/lib/billing/descuento-checkout';
import { mapCodigoDescuento } from '@/lib/supabase-data';
import type { RowCodigosDescuento } from '@/lib/db-types';

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

// La clave de idempotencia vive en lib/billing/clave-checkout-embebido.ts —
// tiene su propia batería de tests, porque decide si dos intentos de pago son
// "el mismo" y eso es dinero.

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
    // Auditoría vs Momence (#canje-codigos-descuento-checkout): mismo criterio
    // que app/api/stripe/checkout — texto tal cual, el servidor recalcula el
    // importe final.
    codigoDescuento?: string;
  } | null;

  if (!body?.studioId) {
    return conCorsWidget(req, NextResponse.json({ error: 'Falta el estudio' }, { status: 400 }));
  }
  if (!body.planId) {
    return conCorsWidget(req, NextResponse.json({ error: 'Falta el plan a comprar' }, { status: 400 }));
  }
  // El email se valida AQUÍ, antes de que llegue a ningún sitio: sin socioId,
  // `entregarPlanComprado` busca la ficha con `.ilike('email', compra.email)`,
  // y en PostgREST `%` y `_` de `ilike` son COMODINES. Un `socioEmail` con
  // comodines que emparejara una sola fila haría que el bono —y con él la
  // tarjeta guardada— se asociaran a una socia ajena sin conocer su id. Mismo
  // patrón de validación que public/interes-lanzamiento y migracion-concierge.
  const EMAIL_RE = /^[^\s@%_]+@[^\s@%_]+\.[^\s@%_]+$/;
  if (body.socioEmail != null && !EMAIL_RE.test(body.socioEmail.trim())) {
    return conCorsWidget(req, NextResponse.json({ error: 'Email no válido' }, { status: 400 }));
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

  // ⚠️ El `socioId` NUNCA se toma del body.
  //
  // Antes era `body.socioId ?? null` sin comprobar nada: era el único endpoint
  // de app/api/public/** con service role que no derivaba la identidad del JWT.
  // Ese valor viaja por `metadata` hasta `entregarPlanComprado`, que lo usa tal
  // cual para insertar `suscripciones` y `recibos`, y hasta el webhook, que
  // escribe `stripe_customer_id`/`stripe_payment_method_id` sobre esa fila. Y
  // `suscripciones_socio_id_fkey` es una FK SIMPLE a `socios(id)`, no compuesta
  // con `studio_id` (verificado en producción), así que la BD tampoco lo
  // impedía. Resultado: pagando con tarjeta propia se podía escribir bono,
  // recibo y suscripción a nombre de otra socia —incluso de OTRO estudio— y,
  // peor, sobrescribir el método de pago guardado de una socia ajena, con lo
  // que los cobros off-session posteriores irían a la tarjeta del atacante.
  //
  // Los dos llamantes reales siguen funcionando igual:
  //  - widget con sesión (lib/widget/usar-datos-widget.ts → postPublicoWidget)
  //    manda el Bearer del portal, así que el socioId se deriva del token;
  //  - "pagar y reservar sin login" (app/reservar/[slug]/page.tsx) no manda
  //    socioId, solo email + sesionId → camino de invitada, intacto.
  let socioId: string | null = null;
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

  let importe = Number(plan.precio);
  if (!(importe > 0)) {
    return conCorsWidget(req, NextResponse.json({ error: 'Importe no válido' }, { status: 409 }));
  }

  // Auditoría vs Momence: canje de código de descuento. Mismo criterio que
  // app/api/stripe/checkout — el servidor recalcula siempre, un código
  // inválido/caducado/agotado no bloquea la compra, solo se ignora.
  let codigoDescuentoId: string | null = null;
  if (body.codigoDescuento) {
    const { data: codigosRaw } = await admin
      .from('codigos_descuento')
      .select('*')
      .eq('studio_id', body.studioId);
    const codigos = (codigosRaw ?? []).map(r => mapCodigoDescuento(r as RowCodigosDescuento));
    const resultado = resolverDescuentoCheckout(codigos, body.codigoDescuento, {
      hoyISO: new Date().toISOString(),
      subtotal: importe,
      esNueva: !socioId,
    });
    if (resultado.ok) {
      importe = Math.max(0, Math.round((importe - resultado.descuento) * 100) / 100);
      const codigoAplicado = codigos.find(c => c.codigo.trim().toUpperCase() === body.codigoDescuento!.trim().toUpperCase());
      codigoDescuentoId = codigoAplicado?.id ?? null;
    }
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
  const stripeAccount = studio.stripe_account_id;
  // Base de idempotencia de ESTE intento — la reutiliza el PaymentIntent de
  // abajo. La creación del Customer usa un sufijo propio: Stripe scopea las
  // claves de idempotencia por cuenta y comprueba que los parámetros
  // coincidan, así que compartir la MISMA clave entre dos llamadas con forma
  // distinta (customers.create vs paymentIntents.create) rompería en el
  // segundo reintento legítimo del mismo intento.
  const idemKey = claveCheckoutEmbebido({
    studioId: body.studioId, planId: body.planId, socioId,
    socioEmail: body.socioEmail ?? null, sesionId: body.sesionId ?? null,
    codigoDescuentoId,
  });

  // I-2 (auditoría 19-ago): el PaymentIntent se creaba con
  // `setup_future_usage: 'off_session'` pero SIN `customer` — Stripe crea el
  // Customer automáticamente en una Checkout Session, pero NO en un
  // PaymentIntent suelto como este. El webhook (`stripe webhook, rama
  // plan_web_embebido`) solo guarda la tarjeta si `typeof pi.customer ===
  // 'string'`, así que nunca guardaba nada: toda socia captada por este
  // camino se quedaba sin método de pago reutilizable, y "Cobrar online" y
  // las renovaciones automáticas fallaban después con "no tiene tarjeta ni
  // mandato SEPA". Mismo patrón que ya usa app/api/stripe/setup-tarjeta —
  // reutilizar el Customer si la socia ya tiene uno, crearlo si no.
  //
  // Fail-open a propósito: esto es una tarjeta GUARDABLE, no el cobro en sí.
  // Que Stripe falle al crear el Customer no debe bloquear el pago — se
  // pierde la posibilidad de guardar la tarjeta esta vez, no el cobro.
  let customerId: string | null = null;
  if (socioId) {
    const { data: socio } = await admin
      .from('socios').select('nombre, email, stripe_customer_id')
      .eq('id', socioId).eq('studio_id', body.studioId).maybeSingle();
    customerId = (socio?.stripe_customer_id as string | null) ?? null;
    if (!customerId) {
      try {
        const customer = await stripe.customers.create(
          {
            name: (socio?.nombre as string | null) ?? undefined,
            email: (socio?.email as string | null) ?? body.socioEmail ?? undefined,
            metadata: { socioId, studioId: body.studioId },
          },
          { stripeAccount, idempotencyKey: `${idemKey}:customer` },
        );
        customerId = customer.id;
        const { error: updErr } = await admin
          .from('socios').update({ stripe_customer_id: customerId })
          .eq('id', socioId).eq('studio_id', body.studioId);
        // Si no se persiste, un Customer que no sabemos que existe se
        // duplicaría en el siguiente intento — mismo motivo que setup-tarjeta
        // aborta aquí en vez de seguir con un id que se va a perder.
        if (updErr) {
          console.error('[checkout-embebido] no se pudo guardar el customer', updErr);
          customerId = null;
        }
      } catch (e) {
        console.error('[checkout-embebido] no se pudo crear el customer de Stripe', e);
        customerId = null;
      }
    }
  } else if (body.socioEmail) {
    // Camino de invitada (sin socioId todavía: la ficha la crea
    // entregarPlanComprado DESPUÉS del pago). No hay fila `socios` donde
    // persistir nada aquí — se crea el Customer igualmente y viaja en el
    // PaymentIntent; el webhook ya escribe `stripe_customer_id: pi.customer`
    // sobre la socia recién creada en la rama de guardado de tarjeta, así
    // que con `customer` presente en el PI ese camino empieza a funcionar
    // solo, sin tocar el webhook.
    try {
      const customer = await stripe.customers.create(
        { name: body.socioNombre, email: body.socioEmail, metadata: { socioEmail: body.socioEmail, studioId: body.studioId } },
        { stripeAccount, idempotencyKey: `${idemKey}:customer` },
      );
      customerId = customer.id;
    } catch (e) {
      console.error('[checkout-embebido] no se pudo crear el customer de Stripe (invitada)', e);
    }
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
  if (codigoDescuentoId) metadata.codigoDescuentoId = codigoDescuentoId;

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCentimos,
      currency: 'eur',
      // `allow_redirects: 'never'` en vez de una lista fija con solo 'card':
      // así Stripe sigue excluyendo automáticamente todo lo que exige salir
      // del widget (Bizum incluido — acción externa en la app del banco, se
      // ofrece aparte con redirect avisado, §4 del diseño), pero SÍ deja
      // pasar los métodos "de tarjeta" que no navegan a ningún sitio: Link,
      // Apple Pay, Google Pay. Con `payment_method_types: ['card']` a secas
      // (como estaba antes) esos tres desaparecían del Payment Element sin
      // que hiciera falta — no son un redirect, son la misma tarjeta con
      // menos fricción.
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
      setup_future_usage: 'off_session',
      ...(customerId ? { customer: customerId } : {}),
      receipt_email: body.socioEmail ?? undefined,
      description: plan.nombre,
      ...(fee !== undefined ? { application_fee_amount: fee } : {}),
      metadata,
    }, {
      stripeAccount,
      // Mejora respecto al camino existente (Checkout Session no la lleva):
      // dos pestañas del mismo intento legítimo no generan dos PaymentIntents
      // cobrables — ver §1/§9.4 del diseño y `claveIdempotencia` arriba.
      idempotencyKey: idemKey,
    });

    return conCorsWidget(req, NextResponse.json({ clientSecret: paymentIntent.client_secret }));
  } catch (err) {
    return conCorsWidget(req, errorInterno('public/checkout-embebido:POST', err, 'No se pudo iniciar el cobro. Inténtalo de nuevo más tarde.'));
  }
}
