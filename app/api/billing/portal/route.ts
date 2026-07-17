import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';

// Portal de facturación de Stripe: la propietaria gestiona/cancela su
// suscripción, cambia de plan y ve sus facturas del SaaS.
export async function POST(req: NextRequest) {
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

  const { data: studio } = await admin
    .from('studios').select('stripe_customer_id').eq('id', sesion.studioId).single();
  if (!studio?.stripe_customer_id) {
    return NextResponse.json({ error: 'Este estudio aún no tiene suscripción' }, { status: 409 });
  }

  const stripe = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const portal = await stripe.billingPortal.sessions.create({
    customer: studio.stripe_customer_id,
    return_url: `${appUrl}/configuracion`,
  });

  return NextResponse.json({ url: portal.url });
}
