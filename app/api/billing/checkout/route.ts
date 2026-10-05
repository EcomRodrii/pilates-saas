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
import { consultarCheckoutPrevio } from '@/lib/billing/checkout-saas-previo';
import { claveCheckoutLock, reclamarCheckoutLock, liberarCheckoutLock } from '@/lib/billing/checkout-lock';
import {
  leerCadenaDeLaSede, cadenaPagaSusSedes, consultarCadenaAntesDeIndividual, checkoutsAbiertosDeLasSedes, caducarCheckouts,
  MENSAJE_SEDE_INCLUIDA_EN_CADENA, MENSAJE_PAGO_DE_CADENA_A_MEDIAS, MENSAJE_PAGO_DE_SEDE_A_MEDIAS,
} from '@/lib/billing/sede-incluida-en-cadena';
import { leerRecompensaPendiente, canjearRecompensa, devolverRecompensa } from '@/lib/billing/recompensa-review-boost';

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

  // PAY-3 (62ª pasada): cerrojo de una fila por estudio, además de la clave de
  // idempotencia (que lleva un bucket de minuto a propósito, ver el comentario
  // de la migración) y de `checkoutPrevio` (que solo ve lo que Stripe YA tiene
  // creado). Cierra la rendija que ni una ni otra cierran solas: dos peticiones
  // casi simultáneas, antes de que ninguna haya llegado a crear su sesión.
  const claveLock = claveCheckoutLock('studio', studio.id);
  if (!(await reclamarCheckoutLock(admin, claveLock))) {
    return NextResponse.json(
      { error: 'Ya hay un pago en marcha para esta suscripción. Espera unos segundos y vuelve a intentarlo.' },
      { status: 409 },
    );
  }
  // Cerrojo de la CADENA, además del de la sede: el checkout de cadena y el
  // individual de una de sus sedes miran los pagos del otro antes de crear el
  // suyo (ver lib/billing/sede-incluida-en-cadena.ts), y sin un cerrojo común dos
  // peticiones a la vez desde dos sedes no se verían.
  let claveCadena: string | null = null;
  const cerrarCadena = async (cadenaId: string): Promise<NextResponse | null> => {
    const clave = claveCheckoutLock('cadena', cadenaId);
    if (!(await reclamarCheckoutLock(admin, clave))) {
      return NextResponse.json(
        { error: 'Ya hay un pago en marcha para esta suscripción. Espera unos segundos y vuelve a intentarlo.' },
        { status: 409 },
      );
    }
    claveCadena = clave;
    return null;
  };
  try {
    // Review Boost (ver lib/billing/recompensa-review-boost.ts): se lee aquí y se
    // canjea justo antes de crear la sesión, nunca antes de un posible 409.
    const recompensa = await leerRecompensaPendiente(admin, studio.id);
    // Crea la sesión con la recompensa canjeada en ese momento; si Stripe falla,
    // se devuelve. `discounts` y `allow_promotion_codes` son mutuamente
    // excluyentes en la API de Stripe.
    const crearConRecompensa = async (
      crear: (discounts: Stripe.Checkout.SessionCreateParams['discounts'] | undefined) => Promise<Stripe.Checkout.Session>,
    ): Promise<NextResponse> => {
      const canjeadaEn = recompensa ? await canjearRecompensa(admin, recompensa) : null;
      const discounts = recompensa && canjeadaEn ? [{ coupon: recompensa.cupon }] : undefined;
      let session: Stripe.Checkout.Session;
      try {
        session = await crear(discounts);
      } catch (err) {
        if (recompensa && canjeadaEn) await devolverRecompensa(admin, recompensa, canjeadaEn);
        throw err;
      }
      if (discounts) capturar(studio.id, { nombre: 'review_boost_reward_claimed', props: {} });
      return NextResponse.json({ url: session.url });
    };
    // PAY-5: se pregunta a STRIPE, no a `studio.subscription_id` (que solo escribe
    // el webhook, minutos después). Ver lib/billing/checkout-saas-previo.ts.
    async function checkoutPrevio(customerId: string): Promise<NextResponse | null> {
      const previo = await consultarCheckoutPrevio(stripe, customerId, plan as string, Boolean(recompensa));
      // Caducar lo que sobra (best-effort: si una ya estaba completada o caducada
      // Stripe lo rechaza, y en el peor caso queda como estaba antes de este arreglo).
      for (const id of previo.expirar) await stripe.checkout.sessions.expire(id).catch(() => {});
      if (previo.accion === 'bloquear') {
        return NextResponse.json(
          { error: 'Ya tienes una suscripción activa. Gestiónala desde Suscripción.' },
          { status: 409 },
        );
      }
      if (previo.accion === 'reutilizar') return NextResponse.json({ url: previo.url });
      return null;
    }
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
      const cerrada = await cerrarCadena(cadena.id);
      if (cerrada) return cerrada;

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
          { error: 'Ya tienes una suscripción activa. Gestiónala desde Suscripción.' },
          { status: 409 },
        );
      }

      // Si el estudio venía de ESTUDIO/BASE con una suscripción individual viva,
      // hay que cancelarla — si no, queda cobrando en paralelo con la de cadena.
      //
      // ⚠️ Auditoría 62ª pasada (PAY-2): esto cancelaba la suscripción individual
      // AQUÍ, antes de crear el Checkout de cadena. Si la propietaria abandonaba
      // la página de pago (cerrar la pestaña, atrás del navegador, tarjeta
      // rechazada y no reintenta), se quedaba sin NINGUNA suscripción — ni la
      // vieja (cancelada) ni la nueva (nunca llegó a pagarse) — con sus rutas de
      // dinero bloqueadas hasta que volviera a intentarlo. «Cero escritura
      // optimista sin comprobar el resultado real»: cancelar algo que ya
      // funciona no puede depender de que un paso POSTERIOR tenga éxito.
      //
      // Se aplaza al webhook: solo se cancela la individual cuando Stripe
      // confirma que la de cadena existe de verdad (`actualizarSuscripcion`,
      // ESTADOS_VIVOS). El id a cancelar viaja en la metadata de la suscripción
      // nueva, que dice qué reemplaza ESTE checkout. (`studio.subscription_id`
      // no lo pisa nadie: el trigger de cadena no propaga ese campo, ver
      // lib/billing/suscripcion-desplazada-por-cadena.ts.)
      const cancelarAlConfirmar =
        studio.subscription_id && studio.subscription_status && studio.subscription_status !== 'canceled'
          ? (studio.subscription_id as string)
          : null;

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

      // Y al revés que en la rama individual: un Checkout de plan individual que
      // siga abierto en alguna de sus sedes se caduca antes de abrir el de la
      // cadena, para que no queden dos formas de pagar lo mismo. Si alguno no se
      // deja caducar (lo normal: se acaba de pagar), no se abre este.
      const deLasSedes = await checkoutsAbiertosDeLasSedes(admin, stripe, cadena.id, customerId);
      if (!(await caducarCheckouts(stripe, deLasSedes))) {
        return NextResponse.json({ error: MENSAJE_PAGO_DE_SEDE_A_MEDIAS }, { status: 409 });
      }

      const yaHay = await checkoutPrevio(customerId);
      if (yaHay) return yaHay;

      const idCadena = cadena.id;
      const customerCadena = customerId;
      return await crearConRecompensa(discounts => stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: customerCadena,
        line_items: [{ price, quantity: 1 }],
        // Sin `trial_period_days`: la prueba gratuita ya se ha disfrutado
        // ANTES de llegar aquí (7 días locales, sin tarjeta, desde que se creó
        // el estudio — ver lib/billing/trial.ts). Añadirla otra vez aquí sería
        // regalar una segunda prueba a quien acaba de terminar la primera.
        subscription_data: {
          // PAY-2: leído por el webhook para cancelar la individual SOLO cuando
          // esta suscripción de cadena está confirmada — nunca antes.
          metadata: { cadenaId: idCadena, plan, ...(cancelarAlConfirmar ? { cancelarSuscripcionAnterior: cancelarAlConfirmar } : {}) },
        },
        metadata: { cadenaId: idCadena, plan },
        success_url: `${appUrl}/suscripcion?suscripcion=ok`,
        cancel_url: `${appUrl}/suscripcion?suscripcion=cancel`,
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
        // ⚠️ Auditoría 2026-09-25 (PAY-5-cadena): la clave no distinguía el descuento y
        // este se decide canjeando `review_boost_recompensas` con un CAS. La
        // primera petición canjea y crea la sesión CON `discounts`; una segunda del
        // mismo minuto ya no encuentra la recompensa, manda `allow_promotion_codes` con
        // la MISMA clave y parámetros distintos, Stripe la rechaza (500) y la propietaria
        // ha perdido el 20 %. Mismo discriminante que la rama BASE/ESTUDIO.
        idempotencyKey: `billing-checkout-cadena-${idCadena}-${plan}-${discounts ? `d${recompensa?.cupon ?? 'si'}` : 'sin'}-${Math.floor(Date.now() / 60000)}`,
      }));
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
        { error: 'Ya tienes una suscripción activa. Gestiónala desde Suscripción.' },
        { status: 409 },
      );
    }

    // Plan individual para una sede cuya cadena ya paga: sería un segundo cobro
    // por lo mismo, y el guard de arriba no lo ve (la sede hereda el estado de la
    // cadena, no su `subscription_id`). Se mira la BD y también a Stripe, porque
    // el webhook tarda; un Checkout de cadena abierto se caduca (puede estar
    // abandonado) y, si no se deja, no se abre este. Va antes de crear el cliente
    // de la sede. Ver lib/billing/sede-incluida-en-cadena.ts.
    if (studio.cadena_id) {
      const cerrada = await cerrarCadena(studio.cadena_id as string);
      if (cerrada) return cerrada;
      const cadena = await leerCadenaDeLaSede(admin, studio.cadena_id as string);
      if (cadena && cadenaPagaSusSedes(cadena.estado)) {
        return NextResponse.json({ error: MENSAJE_SEDE_INCLUIDA_EN_CADENA }, { status: 409 });
      }
      // Si la sede comparte cliente con la cadena (las migradas en 0066), ya lo
      // mira `checkoutPrevio` de abajo, que además puede reutilizar su Checkout.
      if (cadena?.clienteStripe && cadena.clienteStripe !== studio.stripe_customer_id) {
        const enStripe = await consultarCadenaAntesDeIndividual(stripe, cadena.clienteStripe);
        if (enStripe.accion === 'bloquear') {
          return NextResponse.json({ error: MENSAJE_SEDE_INCLUIDA_EN_CADENA }, { status: 409 });
        }
        if (!(await caducarCheckouts(stripe, enStripe.expirar))) {
          return NextResponse.json({ error: MENSAJE_PAGO_DE_CADENA_A_MEDIAS }, { status: 409 });
        }
      }
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

    const yaHay = await checkoutPrevio(customerId);
    if (yaHay) return yaHay;

    const customerSede = customerId;
    return await crearConRecompensa(discounts => stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerSede,
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
      success_url: `${appUrl}/suscripcion?suscripcion=ok`,
      cancel_url: `${appUrl}/suscripcion?suscripcion=cancel`,
      locale: 'es',
      ...(discounts ? { discounts } : { allow_promotion_codes: true }),
    }, {
      // Auditoría 23ª pasada, P-2: mismo criterio que la rama CADENA de
      // arriba — sin esto, dos pestañas o un doble clic entraban ANTES de
      // que ninguna hubiera guardado `subscription_id`, y las dos creaban
      // una Checkout Session real sobre el MISMO customer.
      // ⚠️ Auditoría 2026-09-24 (PAY-5, gemelo del SaaS): la clave identificaba
      // (estudio, plan, minuto) pero NO el descuento, y el descuento se decide
      // canjeando `review_boost_recompensas` con un CAS.
      // La primera petición canjea y crea la sesión CON `discounts`; una segunda
      // del mismo minuto (doble clic, dos pestañas) ya no encuentra la
      // recompensa sin canjear, manda `allow_promotion_codes: true` con la MISMA
      // clave y parámetros distintos, Stripe la rechaza y la propietaria recibe
      // un 500 «No se pudo iniciar la suscripción». Es exactamente el bug que
      // PAY-3 acaba de cerrar en el checkout de socias, en su gemelo del SaaS.
      idempotencyKey: `billing-checkout-${studio.id}-${plan}-${discounts ? `d${recompensa?.cupon ?? 'si'}` : 'sin'}-${Math.floor(Date.now() / 60000)}`,
    }));
  } catch (err) {
    return errorInterno('billing/checkout:POST', err, 'No se pudo iniciar la suscripción. Inténtalo de nuevo más tarde.');
  } finally {
    // Best-effort: si falla, el cerrojo expira solo a los 30 s (ver la migración).
    if (claveCadena) await liberarCheckoutLock(admin, claveCadena);
    await liberarCheckoutLock(admin, claveLock);
  }
}
