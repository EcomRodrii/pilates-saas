import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { dbSetStripeAccountId } from '@/lib/db/supabase-data-admin';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { verificarEstadoOAuth } from '@/lib/oauth-state';
import { registrarDominiosWalletEstudio } from '@/lib/billing/dominios-wallets';

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
  const oauthError = req.nextUrl.searchParams.get('error_description') ?? req.nextUrl.searchParams.get('error');

  if (oauthError) {
    return NextResponse.redirect(`${appUrl}/configuracion?stripe_connect_error=${encodeURIComponent(oauthError)}`);
  }
  // C-8: el studioId sale del `state` FIRMADO (emitido por /api/integrations/
  // oauth-state al PROPIETARIO), no de un id en claro del navegador. Un state
  // ausente, manipulado o caducado se rechaza → no hay CSRF de binding.
  const verificado = verificarEstadoOAuth(req.nextUrl.searchParams.get('state'), 'stripe', Date.now());
  if (!code || !verificado) {
    return NextResponse.redirect(`${appUrl}/configuracion?stripe_connect_error=Estado%20de%20conexi%C3%B3n%20inv%C3%A1lido%20o%20caducado`);
  }
  const studioId = verificado.studioId;

  const stripe = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });

  try {
    const token = await stripe.oauth.token({ grant_type: 'authorization_code', code });
    if (!token.stripe_user_id) {
      throw new Error('Stripe no devolvió una cuenta conectada');
    }
    // Auditoría 22ª pasada (3-sep-2026), D-7: el resultado se comprueba. Antes
    // se descartaba (dbSetStripeAccountId era `void`) y este redirect a
    // `stripe_connected=1` corría igual pasara lo que pasara — incluida una
    // cuenta ya vinculada a OTRO estudio (`uq_studios_stripe_account`, el caso
    // natural de una cadena con varias sedes que reconecta sin querer la misma
    // cuenta): la propietaria veía "conectado" y no cobraba nada.
    const resultado = await dbSetStripeAccountId(studioId, token.stripe_user_id);
    if (!resultado.ok) {
      return NextResponse.redirect(`${appUrl}/configuracion?stripe_connect_error=${encodeURIComponent(resultado.error)}`);
    }

    // Con la cuenta recién conectada, registra sus dominios de wallets:
    // www.tentare.app + ápice (Modo A: el Payment Element vive en el iframe
    // de tentare.app) y los dominios del widget ya autorizados si los hubiera
    // (Modo B). Con Connect direct charge el registro es POR cuenta conectada
    // — sin él, Apple Pay nunca aparece en el checkout de este estudio.
    // Falla-suave por construcción (dominios-wallets.ts nunca lanza), y se
    // espera antes del redirect porque en serverless nada sobrevive a la
    // respuesta.
    // Try propio: en este punto la conexión YA está guardada — un tropiezo
    // aquí no debe caer al catch de abajo y anunciar «no se pudo conectar».
    try {
      const admin = getSupabaseAdmin();
      const { data: studio } = admin
        ? await admin.from('studios').select('widget_dominios_autorizados').eq('id', studioId).maybeSingle()
        : { data: null };
      await registrarDominiosWalletEstudio(
        stripe,
        token.stripe_user_id,
        (studio?.widget_dominios_autorizados as string[] | null) ?? [],
      );
    } catch (e) {
      console.error('[stripe/connect/callback] registro de dominios de wallets', e);
    }

    return NextResponse.redirect(`${appUrl}/configuracion?stripe_connected=1`);
  } catch (err) {
    console.error('[stripe/connect/callback]', err instanceof Error ? err.message : err);
    return NextResponse.redirect(`${appUrl}/configuracion?stripe_connect_error=${encodeURIComponent('No se pudo completar la conexión con Stripe. Inténtalo de nuevo.')}`);
  }
}
