import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { applicationFeeAmount } from '@/lib/stripe-fees';

// ─────────────────────────────────────────────────────────────────────────────
// Lanza un cobro al datáfono físico (server-driven). Crea un PaymentIntent
// `card_present` en la cuenta Connect del estudio y lo envía al lector: el
// datáfono se enciende con el importe. En TEST, simula el acercamiento de la
// tarjeta para poder probar sin hardware.
//
// El POS hace polling a /api/terminal/estado hasta que el PaymentIntent queda
// en `succeeded`; solo entonces registra la venta y sella la factura.
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key.startsWith('sk_test_XXXX')) return NextResponse.json({ error: 'Stripe no configurado' }, { status: 503 });
  const test = key.startsWith('sk_test');
  const stripe = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor sin service-role' }, { status: 503 });

  // A-14: importe en céntimos, controlado en servidor. Antes solo se rechazaba
  // <= 0: un cliente manipulado o un bug de UI podía lanzar al datáfono un cargo
  // arbitrariamente grande (o un typo del tipo 100000000). Se acota a un máximo
  // razonable para un TPV de estudio (10.000 €); ventas mayores no son un caso
  // real de mostrador y deben tramitarse por otra vía.
  const MAX_CENTIMOS = 1_000_000; // 10.000 €
  const body = (await req.json().catch(() => ({}))) as { studioId?: string; amount?: number; concepto?: string };
  if (body.studioId !== sesion.studioId) return NextResponse.json({ error: 'No autorizado para este estudio' }, { status: 403 });
  const amount = Math.round(body.amount ?? 0); // céntimos
  if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: 'Importe inválido' }, { status: 400 });
  if (amount > MAX_CENTIMOS) {
    return NextResponse.json({ error: 'El importe supera el máximo permitido en el datáfono (10.000 €)' }, { status: 400 });
  }

  const { data: studio } = await admin.from('studios')
    .select('stripe_account_id, stripe_terminal_reader_id')
    .eq('id', sesion.studioId).maybeSingle();
  const stripeAccount = studio?.stripe_account_id ?? null;
  const readerId = studio?.stripe_terminal_reader_id ?? null;
  if (!stripeAccount) return NextResponse.json({ error: 'El estudio no tiene Stripe conectado' }, { status: 409 });
  if (!readerId) return NextResponse.json({ error: 'No hay datáfono emparejado. Configúralo primero.' }, { status: 409 });

  // R2: take-rate de plataforma (apagado por defecto; ver lib/stripe-fees.ts).
  const fee = applicationFeeAmount(amount);

  try {
    const pi = await stripe.paymentIntents.create({
      amount,
      currency: 'eur',
      payment_method_types: ['card_present'],
      capture_method: 'automatic',
      metadata: { studioId: sesion.studioId, origen: 'pos_terminal', concepto: body.concepto ?? 'Venta POS' },
      ...(fee !== undefined ? { application_fee_amount: fee } : {}),
    }, { stripeAccount });

    await stripe.terminal.readers.processPaymentIntent(readerId, { payment_intent: pi.id }, { stripeAccount });

    // Solo en test: simular que la clienta acerca la tarjeta al lector.
    if (test) {
      await stripe.testHelpers.terminal.readers.presentPaymentMethod(readerId, {}, { stripeAccount });
    }

    return NextResponse.json({ ok: true, paymentIntentId: pi.id, test });
  } catch (err) {
    const msg = err instanceof Stripe.errors.StripeError ? err.message : 'No se pudo iniciar el cobro en el datáfono';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
