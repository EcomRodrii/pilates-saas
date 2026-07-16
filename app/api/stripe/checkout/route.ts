import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { applicationFeeAmount } from '@/lib/stripe-fees';
import { enforceRateLimit } from '@/lib/rate-limit';

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
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'stripe-checkout', { max: 10, windowSeconds: 60 });
  if (limited) return limited;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key.startsWith('sk_test_XXXX')) {
    return NextResponse.json({ error: 'Stripe no configurado. Añade STRIPE_SECRET_KEY en .env.local' }, { status: 503 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
  }

  const stripe = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });

  const body = await req.json().catch(() => null) as {
    studioId?: string;
    reciboId?: string;
    planId?: string;
    socioId?: string | null;
    socioEmail?: string | null;
    socioNombre?: string;
  } | null;

  if (!body?.studioId) {
    return NextResponse.json({ error: 'Falta el estudio' }, { status: 400 });
  }

  // El importe y el concepto se resuelven contra la BD, validando pertenencia
  // al estudio. metadata.socioId lo lee el webhook para guardar la tarjeta;
  // metadata.reciboId solo se pone para pagos de un recibo real (así el
  // webhook no intenta marcar como cobrado un recibo inexistente).
  let importe: number;
  let concepto: string;
  let socioId: string | null = body.socioId ?? null;
  const metadata: Record<string, string> = { studioId: body.studioId };

  if (body.reciboId) {
    const { data: recibo, error } = await admin
      .from('recibos')
      .select('importe, concepto, estado, studio_id, socio_id')
      .eq('id', body.reciboId)
      .maybeSingle();
    if (error || !recibo) {
      return NextResponse.json({ error: 'Recibo no encontrado' }, { status: 404 });
    }
    if (recibo.studio_id !== body.studioId) {
      return NextResponse.json({ error: 'Ese recibo no pertenece a este estudio' }, { status: 403 });
    }
    if (recibo.estado !== 'PENDIENTE') {
      return NextResponse.json({ error: 'Este recibo ya no está pendiente de cobro' }, { status: 409 });
    }
    importe = Number(recibo.importe);
    concepto = recibo.concepto;
    socioId = recibo.socio_id ?? socioId;
    metadata.reciboId = body.reciboId;
  } else if (body.planId) {
    const { data: plan, error } = await admin
      .from('planes_tarifa')
      .select('nombre, precio, studio_id, activo')
      .eq('id', body.planId)
      .maybeSingle();
    if (error || !plan) {
      return NextResponse.json({ error: 'Plan no encontrado' }, { status: 404 });
    }
    if (plan.studio_id !== body.studioId) {
      return NextResponse.json({ error: 'Ese plan no pertenece a este estudio' }, { status: 403 });
    }
    if (!plan.activo) {
      return NextResponse.json({ error: 'Ese plan ya no está disponible' }, { status: 409 });
    }
    importe = Number(plan.precio);
    concepto = plan.nombre;
    metadata.planId = body.planId;
  } else {
    return NextResponse.json({ error: 'Falta el recibo o el plan a cobrar' }, { status: 400 });
  }

  if (!(importe > 0)) {
    return NextResponse.json({ error: 'Importe no válido' }, { status: 409 });
  }
  if (socioId) metadata.socioId = socioId;

  const { data: studio } = await admin
    .from('studios')
    .select('stripe_account_id')
    .eq('id', body.studioId)
    .single();
  if (!studio?.stripe_account_id) {
    return NextResponse.json({ error: 'Conecta tu cuenta de Stripe desde Configuración → Integraciones antes de cobrar.' }, { status: 409 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';

  // R2: take-rate de plataforma (apagado por defecto; ver lib/stripe-fees.ts).
  const fee = applicationFeeAmount(Math.round(importe * 100));

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
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
    // Crea un Customer de Stripe y guarda la tarjeta para poder cobrar sola
    // (off_session) la próxima vez, sin que la socia reintroduzca la tarjeta.
    customer_creation: 'always',
    payment_intent_data: {
      setup_future_usage: 'off_session',
      ...(fee !== undefined ? { application_fee_amount: fee } : {}),
    },
    metadata,
    success_url: `${appUrl}/pagos?stripe_success=1${body.reciboId ? `&recibo=${body.reciboId}` : ''}`,
    cancel_url: `${appUrl}/pagos?stripe_cancel=1`,
    locale: 'es',
  }, { stripeAccount: studio.stripe_account_id });

  return NextResponse.json({ url: session.url });
}
