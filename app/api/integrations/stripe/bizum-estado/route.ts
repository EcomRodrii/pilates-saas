import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';

// Configuración → Integraciones enseñaba "Conectado" en cuanto había una
// cuenta de Stripe vinculada, sin decir si Bizum de verdad funciona ahí — la
// propietaria solo se enteraba cuando una socia le decía que el pago fallaba
// (#1883). Esta ruta le da el estado REAL, en su propia pantalla, para que no
// tenga que adivinar dónde arreglarlo.
export async function GET(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key.startsWith('sk_test_XXXX')) {
    return NextResponse.json({ error: 'Stripe no configurado' }, { status: 503 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const { data: studio } = await admin
    .from('studios')
    .select('stripe_account_id')
    .eq('id', sesion.studioId)
    .single();
  if (!studio?.stripe_account_id) {
    return NextResponse.json({ error: 'Conecta primero tu cuenta de Stripe' }, { status: 409 });
  }

  const stripe = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });
  try {
    const cuenta = await stripe.accounts.retrieve(studio.stripe_account_id);
    return NextResponse.json({ estado: cuenta.capabilities?.bizum_payments ?? 'inactive' });
  } catch (err) {
    console.error('[integrations/stripe/bizum-estado]', err instanceof Stripe.errors.StripeError ? err.message : err);
    return NextResponse.json({ error: 'No se pudo consultar el estado de Bizum' }, { status: 502 });
  }
}
