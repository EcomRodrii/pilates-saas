import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { verificarSesionStaff } from '@/lib/auth-server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { priceIdDe } from '@/lib/billing/billing';
import { PLANES, TRIAL_DIAS, type Plan } from '@/lib/billing/entitlements';
import { errorInterno } from '@/lib/errores-servidor';

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

  try {
    // Plan CADENA: una sola suscripción cubre todas las sedes de la cadena
    // (studios.cadena_id) — el customer/subscription viven en `cadenas`, no en
    // `studios`. BASE/ESTUDIO siguen 1:1 contra la propia fila de studios.
    if (plan === 'CADENA') {
      let cadenaId = studio.cadena_id as string | null;
      let cadena: { id: string; stripe_customer_id: string | null; subscription_status: string | null } | null = null;
      let cadenaRecienCreada = false;

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
          cadenaRecienCreada = true;
        }
      }
      if (!cadena) throw new Error('No se pudo resolver la cadena');

      // Al crear la cadena en esta misma petición, `cadena.subscription_status`
      // siempre es null — el historial real de prueba gratuita es el del propio
      // estudio, no el de la fila de cadena recién nacida (si no, cada alta de
      // cadena regalaría un trial nuevo aunque el estudio ya hubiera gastado el suyo).
      const primeraVez = cadenaRecienCreada ? !studio.subscription_status : !cadena.subscription_status;

      // Si el estudio venía de ESTUDIO/BASE con una suscripción individual viva,
      // hay que cancelarla — si no, queda cobrando en paralelo con la de cadena.
      if (studio.subscription_id && studio.subscription_status && studio.subscription_status !== 'canceled') {
        await stripe.subscriptions.cancel(studio.subscription_id).catch(() => {
          // Ya cancelada en Stripe (o inexistente) — no bloquea el alta de cadena.
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
        subscription_data: {
          metadata: { cadenaId: cadena.id, plan },
          ...(primeraVez ? { trial_period_days: TRIAL_DIAS } : {}),
        },
        metadata: { cadenaId: cadena.id, plan },
        success_url: `${appUrl}/configuracion?suscripcion=ok`,
        cancel_url: `${appUrl}/configuracion?suscripcion=cancel`,
        locale: 'es',
        allow_promotion_codes: true,
      });

      return NextResponse.json({ url: session.url });
    }

    // Prueba gratuita solo en la PRIMERA suscripción: si el estudio nunca ha tenido
    // suscripción (subscription_status vacío) le damos TRIAL_DIAS días. Un estudio
    // que ya se suscribió antes (aunque cancelara) no vuelve a tener prueba.
    const primeraVez = !studio.subscription_status;

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
      // Vincula la suscripción al estudio y al plan (lo lee el webhook). En la
      // primera suscripción añade la prueba gratuita: el Checkout recoge la tarjeta
      // pero no cobra hasta que termina el trial (se convierte sola).
      subscription_data: {
        metadata: { studioId: studio.id, plan },
        ...(primeraVez ? { trial_period_days: TRIAL_DIAS } : {}),
      },
      metadata: { studioId: studio.id, plan },
      success_url: `${appUrl}/configuracion?suscripcion=ok`,
      cancel_url: `${appUrl}/configuracion?suscripcion=cancel`,
      locale: 'es',
      allow_promotion_codes: true,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    return errorInterno('billing/checkout:POST', err, 'No se pudo iniciar la suscripción. Inténtalo de nuevo más tarde.');
  }
}
