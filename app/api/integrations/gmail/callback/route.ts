import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForTokens, getGoogleAccountEmail, isGmailConfigurado } from '@/lib/gmail';
import { dbSetGmailEmail, dbSaveGmailCredenciales } from '@/lib/supabase-data';
import { verificarEstadoOAuth } from '@/lib/oauth-state';

// Vuelta del OAuth de Gmail (botón "Conectar con Gmail" en Configuración →
// Integraciones). Mismo patrón que app/api/integrations/google-calendar/
// callback/route.ts — cambia el `code` de un solo uso por un access/refresh
// token y los guarda para ese estudio, con provider='gmail' para no
// pisar los tokens de Google Calendar si el estudio tiene ambas conectadas.
export async function GET(req: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
  if (!isGmailConfigurado()) {
    return NextResponse.redirect(`${appUrl}/configuracion?gmail_error=Gmail%20no%20configurado`);
  }

  const code = req.nextUrl.searchParams.get('code');
  const oauthError = req.nextUrl.searchParams.get('error_description') ?? req.nextUrl.searchParams.get('error');

  if (oauthError) {
    return NextResponse.redirect(`${appUrl}/configuracion?gmail_error=${encodeURIComponent(oauthError)}`);
  }
  const verificado = verificarEstadoOAuth(req.nextUrl.searchParams.get('state'), 'gmail', Date.now());
  if (!code || !verificado) {
    return NextResponse.redirect(`${appUrl}/configuracion?gmail_error=Estado%20de%20conexi%C3%B3n%20inv%C3%A1lido%20o%20caducado`);
  }
  const studioId = verificado.studioId;

  try {
    const tokens = await exchangeCodeForTokens(code);
    const email = await getGoogleAccountEmail(tokens.accessToken);
    await dbSaveGmailCredenciales(studioId, tokens);
    await dbSetGmailEmail(studioId, email);
    return NextResponse.redirect(`${appUrl}/configuracion?gmail_connected=1`);
  } catch (err) {
    console.error('[integrations/gmail/callback]', err instanceof Error ? err.message : err);
    return NextResponse.redirect(`${appUrl}/configuracion?gmail_error=${encodeURIComponent('No se pudo completar la conexión con Gmail. Inténtalo de nuevo.')}`);
  }
}
