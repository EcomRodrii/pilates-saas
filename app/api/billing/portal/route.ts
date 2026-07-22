import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno } from '@/lib/errores-servidor';

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
    .from('studios').select('stripe_customer_id, cadena_id').eq('id', sesion.studioId).single();
  if (!studio) return NextResponse.json({ error: 'Estudio no encontrado' }, { status: 404 });

  // Plan CADENA: el customer de Stripe vive en `cadenas`, no en `studios`
  // (una sola suscripción cubre todas las sedes) — ver app/api/billing/checkout.
  let customerId = studio.stripe_customer_id as string | null;
  if (!customerId && studio.cadena_id) {
    const { data: cadena } = await admin.from('cadenas').select('stripe_customer_id').eq('id', studio.cadena_id).maybeSingle();
    customerId = cadena?.stripe_customer_id ?? null;
  }
  if (!customerId) {
    return NextResponse.json({ error: 'Este estudio aún no tiene suscripción' }, { status: 409 });
  }

  const stripe = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  try {
    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${appUrl}/configuracion`,
    });

    return NextResponse.json({ url: portal.url });
  } catch (err) {
    return errorInterno('billing/portal:POST', err, 'No se pudo abrir el portal de facturación. Inténtalo de nuevo más tarde.');
  }
}
