import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

export async function POST(req: NextRequest) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key.startsWith('sk_test_XXXX')) {
    return NextResponse.json({ error: 'Stripe no configurado. Añade STRIPE_SECRET_KEY en .env.local' }, { status: 503 });
  }

  const stripe = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });

  const body = await req.json() as {
    reciboId: string;
    concepto: string;
    importe: number;
    socioEmail: string | null;
    socioNombre: string;
  };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'eur',
          product_data: {
            name: body.concepto,
            description: `Pilates Boutique · ${body.socioNombre}`,
          },
          unit_amount: Math.round(body.importe * 100),
        },
        quantity: 1,
      },
    ],
    customer_email: body.socioEmail ?? undefined,
    metadata: { reciboId: body.reciboId },
    success_url: `${appUrl}/pagos?stripe_success=1&recibo=${body.reciboId}`,
    cancel_url:  `${appUrl}/pagos?stripe_cancel=1`,
    locale: 'es',
  });

  return NextResponse.json({ url: session.url });
}
