import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';

// Comprobación PROACTIVA de si la cuenta Stripe Connect del estudio puede
// aceptar domiciliaciones SEPA — antes de ofrecer el botón "Domiciliar" en el
// portal (app/portal/[slug]/mi-plan/page.tsx). Sin esto, la socia solo se
// enteraba de que SEPA no estaba activado al volver del Checkout con un
// error (ver el catch de setup-sepa/route.ts, que sigue ahí como red de
// seguridad si esta comprobación falla o queda desactualizada).
//
// Semipúblico como setup-sepa: solo devuelve un booleano, nada sensible.
export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'stripe-sepa-disponible', { max: 30, windowSeconds: 60 });
  if (limited) return limited;

  const studioId = req.nextUrl.searchParams.get('studioId');
  if (!studioId) return NextResponse.json({ error: 'Falta el estudio' }, { status: 400 });

  const key = process.env.STRIPE_SECRET_KEY;
  const admin = getSupabaseAdmin();
  if (!key || key.startsWith('sk_test_XXXX') || !admin) {
    // Sin Stripe configurado no hay SEPA que ofrecer, pero tampoco es un error
    // del estudio: se responde "no disponible" en vez de un 503 que el portal
    // tendría que distinguir de un fallo real.
    return NextResponse.json({ disponible: false });
  }

  const { data: studio } = await admin
    .from('studios')
    .select('stripe_account_id')
    .eq('id', studioId)
    .maybeSingle();
  if (!studio?.stripe_account_id) return NextResponse.json({ disponible: false });

  const stripe = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });
  try {
    const cuenta = await stripe.accounts.retrieve(studio.stripe_account_id);
    const disponible = cuenta.capabilities?.sepa_debit_payments === 'active';
    return NextResponse.json({ disponible });
  } catch {
    // Fail-open: un fallo de red/Stripe no debe ocultar una opción de pago
    // que sí funciona. Si de verdad no está activada, setup-sepa lo detecta
    // igualmente al intentarlo (red de seguridad ya existente).
    return NextResponse.json({ disponible: true });
  }
}
