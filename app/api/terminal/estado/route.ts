import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// Estado de un cobro en curso en el datáfono. El POS lo consulta en bucle hasta
// que el PaymentIntent queda en `succeeded` (o `canceled`). Devuelve el status
// tal cual de Stripe: requires_payment_method / processing / succeeded / canceled.
export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key.startsWith('sk_test_XXXX')) return NextResponse.json({ error: 'Stripe no configurado' }, { status: 503 });
  const stripe = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor sin service-role' }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { studioId?: string; paymentIntentId?: string };
  if (body.studioId !== sesion.studioId) return NextResponse.json({ error: 'No autorizado para este estudio' }, { status: 403 });
  if (!body.paymentIntentId) return NextResponse.json({ error: 'Falta el pago' }, { status: 400 });

  const { data: studio } = await admin.from('studios').select('stripe_account_id').eq('id', sesion.studioId).maybeSingle();
  const stripeAccount = studio?.stripe_account_id ?? null;
  if (!stripeAccount) return NextResponse.json({ error: 'El estudio no tiene Stripe conectado' }, { status: 409 });

  try {
    const pi = await stripe.paymentIntents.retrieve(body.paymentIntentId, {}, { stripeAccount });
    return NextResponse.json({ ok: true, status: pi.status });
  } catch (err) {
    const msg = err instanceof Stripe.errors.StripeError ? err.message : 'No se pudo consultar el estado del cobro';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
