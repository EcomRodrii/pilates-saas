import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { applicationFeeAmount } from '@/lib/billing/stripe-fees';

// Fase 1 · PR-5 — Bizum presencial en el POS.
//
// Bizum es un método redirigido (no card_present): el cliente paga desde su app
// bancaria. Generamos un Checkout hosted con `payment_method_types: ['bizum']`
// sobre la cuenta conectada del estudio; el POS muestra la URL como enlace/QR
// para que el cliente la abra en su móvil. El cobro se confirma vía webhook
// (payment_intent.succeeded, origen='pos_bizum') que lo deja en el backstop de
// reconciliación POS (misma vía que el datáfono), así ningún cobro se pierde.
//
// SEGURIDAD: solo staff autenticado; el importe se valida en servidor (tope
// 10.000 €, como el datáfono) y el concepto se sanea.
export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key.startsWith('sk_test_XXXX')) {
    return NextResponse.json({ error: 'Stripe no configurado' }, { status: 503 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
  }

  const body = (await req.json().catch(() => null)) as { amount?: number; concepto?: string } | null;
  const amount = Math.round(Number(body?.amount ?? 0));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) {
    return NextResponse.json({ error: 'Importe no válido' }, { status: 400 });
  }
  const concepto = (body?.concepto ?? 'Venta POS').toString().slice(0, 120);

  const { data: studio } = await admin
    .from('studios')
    .select('stripe_account_id')
    .eq('id', sesion.studioId)
    .single();
  if (!studio?.stripe_account_id) {
    return NextResponse.json({ error: 'Conecta tu cuenta de Stripe antes de cobrar por Bizum.' }, { status: 409 });
  }

  const stripe = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
  const fee = applicationFeeAmount(amount);

  try {
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        payment_method_types: ['bizum'],
        line_items: [{
          price_data: { currency: 'eur', product_data: { name: concepto }, unit_amount: amount },
          quantity: 1,
        }],
        payment_intent_data: {
          metadata: { studioId: sesion.studioId, origen: 'pos_bizum', concepto },
          ...(fee !== undefined ? { application_fee_amount: fee } : {}),
        },
        metadata: { studioId: sesion.studioId, origen: 'pos_bizum', concepto },
        success_url: `${appUrl}/pos?bizum=ok`,
        cancel_url: `${appUrl}/pos?bizum=cancel`,
        locale: 'es',
      },
      { stripeAccount: studio.stripe_account_id },
    );
    return NextResponse.json({ url: session.url });
  } catch (err) {
    const mensaje = err instanceof Stripe.errors.StripeError ? err.message : 'No se pudo iniciar el cobro Bizum';
    return NextResponse.json({ error: mensaje }, { status: 400 });
  }
}
