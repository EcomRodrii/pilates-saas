import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { verificarSesionStaff } from '@/lib/auth-server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { priceIdDe } from '@/lib/billing/billing';
import { PLANES, type Plan } from '@/lib/billing/entitlements';

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
    .from('studios').select('id, nombre, email, stripe_customer_id')
    .eq('id', sesion.studioId).single();
  if (!studio) return NextResponse.json({ error: 'Estudio no encontrado' }, { status: 404 });

  const stripe = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });

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

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price, quantity: 1 }],
    // Vincula la suscripción al estudio y al plan (lo lee el webhook).
    subscription_data: { metadata: { studioId: studio.id, plan } },
    metadata: { studioId: studio.id, plan },
    success_url: `${appUrl}/configuracion?suscripcion=ok`,
    cancel_url: `${appUrl}/configuracion?suscripcion=cancel`,
    locale: 'es',
    allow_promotion_codes: true,
  });

  return NextResponse.json({ url: session.url });
}
