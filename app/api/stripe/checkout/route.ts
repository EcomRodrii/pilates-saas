import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key.startsWith('sk_test_XXXX')) {
    return NextResponse.json({ error: 'Stripe no configurado. Añade STRIPE_SECRET_KEY en .env.local' }, { status: 503 });
  }

  const stripe = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });

  const body = await req.json() as {
    reciboId: string;
    socioId: string;
    studioId: string;
    concepto: string;
    importe: number;
    socioEmail: string | null;
    socioNombre: string;
  };

  const { data: studio } = await supabase.from('studios').select('stripe_account_id').eq('id', body.studioId).single();
  if (!studio?.stripe_account_id) {
    return NextResponse.json({ error: 'Conecta tu cuenta de Stripe desde Configuración → Integraciones antes de cobrar.' }, { status: 409 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';

  // El cobro se procesa directamente en la cuenta de Stripe del estudio (no
  // en la de la plataforma) — pasando { stripeAccount } se convierte en un
  // "direct charge": el dinero y la comisión de Stripe van a su cuenta.
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'eur',
          product_data: {
            name: body.concepto,
            description: `Tentare · ${body.socioNombre}`,
          },
          unit_amount: Math.round(body.importe * 100),
        },
        quantity: 1,
      },
    ],
    customer_email: body.socioEmail ?? undefined,
    // Crea un Customer de Stripe y guarda la tarjeta para poder cobrar sola
    // (off_session) la próxima vez que este recibo tenga pagos pendientes,
    // sin que la socia tenga que volver a introducir la tarjeta.
    customer_creation: 'always',
    payment_intent_data: { setup_future_usage: 'off_session' },
    metadata: { reciboId: body.reciboId, socioId: body.socioId },
    success_url: `${appUrl}/pagos?stripe_success=1&recibo=${body.reciboId}`,
    cancel_url:  `${appUrl}/pagos?stripe_cancel=1`,
    locale: 'es',
  }, { stripeAccount: studio.stripe_account_id });

  return NextResponse.json({ url: session.url });
}
