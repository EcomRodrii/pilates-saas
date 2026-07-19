import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';

// Fase 1 · PR-2 — Alta de mandato SEPA (domiciliación de la mensualidad).
//
// Reutiliza el patrón de Stripe Checkout HOSTED (igual que /api/stripe/checkout)
// pero en `mode: 'setup'` con `sepa_debit`: Stripe recoge el IBAN, muestra el
// texto legal del mandato SEPA CORE y, al aceptar la socia, crea y guarda el
// mandato + el PaymentMethod sobre la cuenta conectada del estudio. No
// construimos un IBAN Element propio: Stripe aloja la UI y el consentimiento.
//
// El webhook (checkout.session.completed, mode='setup', purpose='sepa_mandate')
// lee el SetupIntent y persiste socios.sepa_payment_method_id / sepa_mandate_id
// y metodo_pago_preferido='SEPA'. Luego el cobro recurrente (PR-3) usa ese
// método off-session.
//
// Semipúblico por diseño (la socia lo inicia desde el portal sin sesión de
// staff): la defensa es validar que el socio pertenece al estudio, no exigir
// login. Solo prepara un mandato; no mueve dinero.
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'stripe-setup-sepa', { max: 10, windowSeconds: 60 });
  if (limited) return limited;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key.startsWith('sk_test_XXXX')) {
    return NextResponse.json({ error: 'Stripe no configurado' }, { status: 503 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
  }

  const stripe = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });

  const body = (await req.json().catch(() => null)) as {
    studioId?: string;
    socioId?: string;
    slug?: string;
  } | null;

  if (!body?.studioId || !body?.socioId) {
    return NextResponse.json({ error: 'Falta el estudio o la socia' }, { status: 400 });
  }

  // Validar pertenencia: el socio debe existir y ser de este estudio.
  const { data: socio, error: socioErr } = await admin
    .from('socios')
    .select('id, studio_id, nombre, email, stripe_customer_id')
    .eq('id', body.socioId)
    .maybeSingle();
  if (socioErr || !socio) {
    return NextResponse.json({ error: 'Socia no encontrada' }, { status: 404 });
  }
  if (socio.studio_id !== body.studioId) {
    return NextResponse.json({ error: 'Esa socia no pertenece a este estudio' }, { status: 403 });
  }

  const { data: studio } = await admin
    .from('studios')
    .select('stripe_account_id')
    .eq('id', body.studioId)
    .single();
  if (!studio?.stripe_account_id) {
    return NextResponse.json({ error: 'El estudio no tiene Stripe conectado.' }, { status: 409 });
  }
  const stripeAccount = studio.stripe_account_id;

  try {
    // El mandato SEPA se guarda contra un Customer de la cuenta conectada.
    // Reutilizamos el Customer si ya existe (p. ej. la socia ya pagó con tarjeta);
    // si no, lo creamos y lo persistimos para futuros cobros.
    let customerId = socio.stripe_customer_id ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create(
        { name: socio.nombre ?? undefined, email: socio.email ?? undefined, metadata: { socioId: socio.id, studioId: body.studioId } },
        { stripeAccount },
      );
      customerId = customer.id;
      const { error: updErr } = await admin.from('socios').update({ stripe_customer_id: customerId }).eq('id', socio.id);
      if (updErr) {
        return NextResponse.json({ error: 'No se pudo preparar el cliente de pago' }, { status: 500 });
      }
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
    const base = body.slug ? `${appUrl}/portal/${encodeURIComponent(body.slug)}/mi-plan` : `${appUrl}/pagos`;

    const session = await stripe.checkout.sessions.create(
      {
        mode: 'setup',
        payment_method_types: ['sepa_debit'],
        customer: customerId,
        metadata: { studioId: body.studioId, socioId: socio.id, purpose: 'sepa_mandate' },
        // El mandato queda ligado al SetupIntent; lo copiamos a metadata del SI
        // para que el webhook lo relacione sin ambigüedad.
        setup_intent_data: { metadata: { studioId: body.studioId, socioId: socio.id, purpose: 'sepa_mandate' } },
        success_url: `${base}?sepa=ok`,
        cancel_url: `${base}?sepa=cancel`,
        locale: 'es',
      },
      { stripeAccount },
    );

    return NextResponse.json({ url: session.url });
  } catch (err) {
    // Nunca mostramos el error técnico de Stripe (en inglés) a la SOCIA. El
    // detalle va al log; a ella le devolvemos un mensaje claro en español.
    const raw = err instanceof Stripe.errors.StripeError ? err.message : String(err ?? '');
    console.error('[setup-sepa]', raw);
    // Causa típica: la cuenta conectada del estudio no tiene ACTIVADO el método
    // "Adeudo directo SEPA" (Stripe → Métodos de pago). No es un fallo de la
    // socia: la domiciliación aún no está disponible en ese estudio.
    const sepaNoDisponible = /sepa_debit/i.test(raw) && /(invalid|not activated|activ|no válido|inválid)/i.test(raw);
    const mensaje = sepaNoDisponible
      ? 'La domiciliación por SEPA todavía no está disponible en este estudio. Puedes pagar con tarjeta mientras tanto.'
      : 'No se pudo iniciar la domiciliación SEPA. Inténtalo de nuevo más tarde.';
    return NextResponse.json(
      { error: mensaje, code: sepaNoDisponible ? 'SEPA_NO_DISPONIBLE' : 'ERROR_SEPA' },
      { status: 400 },
    );
  }
}
