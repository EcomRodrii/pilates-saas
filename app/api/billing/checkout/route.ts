import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { verificarSesionStaff } from '@/lib/auth-server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { priceIdDe } from '@/lib/billing/billing';
import { comprobarModoStripe } from '@/lib/billing/modo-stripe';
import { PLANES, suscripcionActiva, type Plan } from '@/lib/billing/entitlements';
import { errorInterno } from '@/lib/errores-servidor';
import { capturar } from '@/lib/analytics';

// Suscripción del ESTUDIO al SaaS (Stripe Billing). Solo la propietaria puede
// suscribir su negocio. Crea (o reutiliza) el Customer de Stripe del estudio y
// abre un Checkout en modo subscription para el plan elegido.
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'billing-checkout', { max: 10, windowSeconds: 60 });
  if (limited) return limited;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key.startsWith('sk_test_XXXX')) {
    return NextResponse.json({ error: 'Stripe no configurado' }, { status: 503 });
  }
  // Otra puerta por la que entra dinero (alta de suscripción SaaS del
  // estudio). Mismo guardia que /api/stripe/checkout, terminal/cobrar y
  // pos-bizum: con el `.env.local` de producción copiado a una máquina, esta
  // ruta abriría un Checkout de suscripción real. Ver lib/billing/modo-stripe.ts.
  const modo = comprobarModoStripe();
  if (!modo.puedeCobrar) {
    return NextResponse.json({ error: modo.motivo }, { status: 503 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol !== 'PROPIETARIO') {
    return NextResponse.json({ error: 'Solo la propietaria puede gestionar la suscripción' }, { status: 403 });
  }

  const body = await req.json().catch(() => null) as { plan?: string } | null;
  const plan = body?.plan as Plan | undefined;
  if (!plan || !PLANES.includes(plan)) {
    return NextResponse.json({ error: 'Plan no válido' }, { status: 400 });
  }
  const price = priceIdDe(plan);
  if (!price) {
    return NextResponse.json({ error: `Falta el price de Stripe para el plan ${plan} (STRIPE_PRICE_${plan})` }, { status: 503 });
  }

  const { data: studio } = await admin
    .from('studios').select('id, nombre, email, cadena_id, stripe_customer_id, subscription_id, subscription_status')
    .eq('id', sesion.studioId).single();
  if (!studio) return NextResponse.json({ error: 'Estudio no encontrado' }, { status: 404 });

  const stripe = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  // Review Boost: si hay una recompensa pendiente (feedback interno 4-5★, ver
  // app/api/growth/review-boost/feedback/route.ts), se aplica el 20% al
  // Checkout SIN que el estudio tenga que teclear ningún código —
  // `discounts` y `allow_promotion_codes` son mutuamente excluyentes en la
  // API de Stripe. Compare-and-set: si otra petición concurrente ya la
  // canjeó, esta pierde la carrera y cae al camino normal sin fallar.
  //
  // Límite conocido y aceptado (documentado en el plan): un checkout
  // abandonado deja la recompensa "canjeada" sin que el estudio haya pagado
  // — bajo impacto (20% de un mes), no justifica una reserva-con-TTL.
  let discounts: Stripe.Checkout.SessionCreateParams['discounts'] | undefined;
  const { data: recompensa } = await admin
    .from('review_boost_recompensas')
    .select('id, stripe_coupon_id')
    .eq('studio_id', studio.id).is('canjeada_en', null).maybeSingle();
  if (recompensa) {
    const { data: reclamada } = await admin
      .from('review_boost_recompensas')
      .update({ canjeada_en: new Date().toISOString() })
      .eq('id', recompensa.id).is('canjeada_en', null).select('id').maybeSingle();
    if (reclamada) discounts = [{ coupon: recompensa.stripe_coupon_id as string }];
  }

  try {
    // Plan CADENA: una sola suscripción cubre todas las sedes de la cadena
    // (studios.cadena_id) — el customer/subscription viven en `cadenas`, no en
    // `studios`. BASE/ESTUDIO siguen 1:1 contra la propia fila de studios.
    if (plan === 'CADENA') {
      let cadenaId = studio.cadena_id as string | null;
      let cadena: { id: string; stripe_customer_id: string | null; subscription_status: string | null } | null = null;

      if (cadenaId) {
        const { data } = await admin.from('cadenas').select('id, stripe_customer_id, subscription_status').eq('id', cadenaId).maybeSingle();
        cadena = data;
      }
      if (!cadena) {
        // Primera vez que esta propietaria contrata CADENA: crea la cadena y
        // vincula el estudio actual como su primera sede. El UPDATE lleva
        // `is('cadena_id', null)` para detectar una carrera con otra petición
        // concurrente (doble clic): si no afecta a ninguna fila, alguien más
        // ganó — se borra la cadena huérfana recién creada y se usa la real.
        cadenaId = `cadena-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const { error: cadenaError } = await admin.from('cadenas').insert({
          id: cadenaId, nombre: studio.nombre, owner_auth_user_id: sesion.userId,
        });
        if (cadenaError) throw new Error(`crear cadena: ${cadenaError.message}`);
        const { data: vinculado, error: linkError } = await admin.from('studios')
          .update({ cadena_id: cadenaId }).eq('id', studio.id).is('cadena_id', null)
          .select('id').maybeSingle();
        if (linkError) throw new Error(`vincular cadena_id: ${linkError.message}`);
        if (!vinculado) {
          await admin.from('cadenas').delete().eq('id', cadenaId);
          const { data: real } = await admin.from('studios').select('cadena_id').eq('id', studio.id).single();
          cadenaId = real?.cadena_id ?? null;
          if (!cadenaId) throw new Error('No se pudo resolver la cadena tras condición de carrera');
          const { data } = await admin.from('cadenas').select('id, stripe_customer_id, subscription_status').eq('id', cadenaId).maybeSingle();
          cadena = data;
        } else {
          cadena = { id: cadenaId, stripe_customer_id: null, subscription_status: null };
        }
      }
      if (!cadena) throw new Error('No se pudo resolver la cadena');

      // 19ª auditoría · F-4: el guard anti-doble-suscripción vivía SOLO después
      // del `return` de esta rama, así que protegía a BASE/ESTUDIO y no a
      // CADENA — su gemela. `cadena.subscription_status` se leía dos veces y no
      // se usaba nunca. Una propietaria con CADENA ya activa que volviera a
      // pulsar "Contratar" (doble clic, caché desincronizada, replay) abría un
      // segundo Checkout de suscripción sobre el mismo customer: dos
      // suscripciones CADENA cobrando en paralelo. Mismo criterio que abajo,
      // incluido 'past_due' vía `suscripcionActiva()`.
      if (suscripcionActiva(cadena.subscription_status)) {
        return NextResponse.json(
          { error: 'Ya tienes una suscripción activa. Gestiónala desde Configuración → Facturación.' },
          { status: 409 },
        );
      }

      // Si el estudio venía de ESTUDIO/BASE con una suscripción individual viva,
      // hay que cancelarla — si no, queda cobrando en paralelo con la de cadena.
      //
      // Auditoría de producto (P0-4): el `.catch(() => {})` tragaba CUALQUIER
      // fallo de Stripe, no solo "ya estaba cancelada" — un timeout, un
      // rate-limit o una clave inválida dejaban seguir el alta de CADENA con la
      // suscripción individual todavía viva: doble cobro real, sin log ni
      // aviso. Solo `resource_missing` (ya cancelada/inexistente en Stripe) es
      // seguro de ignorar; cualquier otro código relanza para que el `catch`
      // exterior lo registre (errorInterno → Sentry) y bloquee el alta.
      if (studio.subscription_id && studio.subscription_status && studio.subscription_status !== 'canceled') {
        await stripe.subscriptions.cancel(studio.subscription_id).catch((err: unknown) => {
          const code = err instanceof Stripe.errors.StripeError ? err.code : undefined;
          if (code !== 'resource_missing') throw err;
        });
      }

      let customerId = cadena.stripe_customer_id;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: studio.email ?? undefined,
          name: studio.nombre ?? undefined,
          metadata: { cadenaId: cadena.id },
        });
        customerId = customer.id;
        await admin.from('cadenas').update({ stripe_customer_id: customerId }).eq('id', cadena.id);
      }

      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: customerId,
        line_items: [{ price, quantity: 1 }],
        // Sin `trial_period_days`: la prueba gratuita ya se ha disfrutado
        // ANTES de llegar aquí (7 días locales, sin tarjeta, desde que se creó
        // el estudio — ver lib/billing/trial.ts). Añadirla otra vez aquí sería
        // regalar una segunda prueba a quien acaba de terminar la primera.
        subscription_data: {
          metadata: { cadenaId: cadena.id, plan },
        },
        metadata: { cadenaId: cadena.id, plan },
        success_url: `${appUrl}/configuracion?suscripcion=ok`,
        cancel_url: `${appUrl}/configuracion?suscripcion=cancel`,
        locale: 'es',
        ...(discounts ? { discounts } : { allow_promotion_codes: true }),
      }, {
        // Auditoría 23ª pasada, P-2: sin esto, dos pestañas (o un doble clic
        // con la caché del panel desincronizada) entraban ANTES de que
        // ninguna hubiera guardado `subscription_id` — el guard de
        // "ya está activa" de arriba lee ESE campo, así que las dos lo
        // pasaban y `checkout.sessions.create` creaba dos Checkout Sessions
        // reales sobre el MISMO customer. Con la misma clave, Stripe
        // devuelve la sesión que ya creó la primera en vez de abrir una
        // segunda. Ventana de 1 minuto (mismo criterio que
        // `claveCheckoutPlanModoA`): un reintento minutos después, con la
        // suscripción anterior ya cancelada, sigue pudiendo contratar.
        idempotencyKey: `billing-checkout-cadena-${cadena.id}-${plan}-${Math.floor(Date.now() / 60000)}`,
      });

      if (discounts) capturar(studio.id, { nombre: 'review_boost_reward_claimed', props: {} });
      return NextResponse.json({ url: session.url });
    }

    // No crear una segunda suscripción en paralelo: el control de "ya está
    // activo" antes vivía solo en la UI (el botón de contratar se ocultaba si
    // ya había plan). Una llamada directa a este endpoint (bug de frontend,
    // doble clic con caché desincronizada, replay) creaba un segundo
    // checkout.sessions.create sobre el MISMO customer — doble suscripción,
    // doble cobro real. Se comprueba en servidor, no solo en cliente.
    //
    // `suscripcionActiva()` (no una comparación manual): incluye 'past_due'
    // a propósito — Stripe sigue reintentando el cobro, la suscripción
    // sigue viva. Dejarla pasar reabriría el mismo bug para ese estado.
    if (studio.subscription_id && suscripcionActiva(studio.subscription_status)) {
      return NextResponse.json(
        { error: 'Ya tienes una suscripción activa. Gestiónala desde Configuración → Facturación.' },
        { status: 409 },
      );
    }

    // Customer del estudio (se crea una vez y se guarda).
    let customerId = studio.stripe_customer_id as string | null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: studio.email ?? undefined,
        name: studio.nombre ?? undefined,
        metadata: { studioId: studio.id },
      });
      customerId = customer.id;
      await admin.from('studios').update({ stripe_customer_id: customerId }).eq('id', studio.id);
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price, quantity: 1 }],
      // Vincula la suscripción al estudio y al plan (lo lee el webhook).
      //
      // ⚠️ Ya NO se pide `trial_period_days`. La prueba gratuita dejó de vivir
      // en Stripe: son 7 días locales y sin tarjeta que arrancan al crear el
      // estudio (lib/billing/trial.ts). Quien llega hasta aquí es porque
      // decidió pagar —durante su prueba o después de agotarla—, así que este
      // Checkout cobra desde el primer periodo.
      subscription_data: {
        metadata: { studioId: studio.id, plan },
      },
      metadata: { studioId: studio.id, plan },
      success_url: `${appUrl}/configuracion?suscripcion=ok`,
      cancel_url: `${appUrl}/configuracion?suscripcion=cancel`,
      locale: 'es',
      ...(discounts ? { discounts } : { allow_promotion_codes: true }),
    }, {
      // Auditoría 23ª pasada, P-2: mismo criterio que la rama CADENA de
      // arriba — sin esto, dos pestañas o un doble clic entraban ANTES de
      // que ninguna hubiera guardado `subscription_id`, y las dos creaban
      // una Checkout Session real sobre el MISMO customer.
      idempotencyKey: `billing-checkout-${studio.id}-${plan}-${Math.floor(Date.now() / 60000)}`,
    });

    if (discounts) capturar(studio.id, { nombre: 'review_boost_reward_claimed', props: {} });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    return errorInterno('billing/checkout:POST', err, 'No se pudo iniciar la suscripción. Inténtalo de nuevo más tarde.');
  }
}
