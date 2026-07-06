import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { dbSetStripeAccountId } from '@/lib/supabase-data';

// Vuelta del OAuth de Stripe Connect (ver el botón "Conectar con Stripe" en
// Configuración → Integraciones). Cambia el `code` de un solo uso por el id
// de la cuenta conectada del estudio — a partir de ahí, todos los cobros de
// ese estudio se procesan en SU cuenta de Stripe, no en la de la plataforma.
export async function GET(req: NextRequest) {
  const key = process.env.STRIPE_SECRET_KEY;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
  if (!key || key.startsWith('sk_test_XXXX')) {
    return NextResponse.redirect(`${appUrl}/configuracion?stripe_connect_error=Stripe%20no%20configurado`);
  }

  const code = req.nextUrl.searchParams.get('code');
  const studioId = req.nextUrl.searchParams.get('state');
  const oauthError = req.nextUrl.searchParams.get('error_description') ?? req.nextUrl.searchParams.get('error');

  if (oauthError) {
    return NextResponse.redirect(`${appUrl}/configuracion?stripe_connect_error=${encodeURIComponent(oauthError)}`);
  }
  if (!code || !studioId) {
    return NextResponse.redirect(`${appUrl}/configuracion?stripe_connect_error=Faltan%20datos%20de%20Stripe`);
  }

  const stripe = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });

  try {
    const token = await stripe.oauth.token({ grant_type: 'authorization_code', code });
    if (!token.stripe_user_id) {
      throw new Error('Stripe no devolvió una cuenta conectada');
    }
    await dbSetStripeAccountId(studioId, token.stripe_user_id);
    return NextResponse.redirect(`${appUrl}/configuracion?stripe_connected=1`);
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : 'Error desconocido al conectar con Stripe';
    return NextResponse.redirect(`${appUrl}/configuracion?stripe_connect_error=${encodeURIComponent(mensaje)}`);
  }
}
