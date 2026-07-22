import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForTokens, getGoogleAccountEmail, isGoogleCalendarConfigurado } from '@/lib/google-calendar';
import { dbSetGoogleCalendarEmail, dbSaveGoogleCalendarCredenciales } from '@/lib/supabase-data';
import { verificarEstadoOAuth } from '@/lib/oauth-state';

// Vuelta del OAuth de Google Calendar (botón "Conectar con Google" en
// Configuración → Integraciones). Cambia el `code` de un solo uso por un
// access/refresh token y los guarda para ese estudio — mismo patrón que
// app/api/stripe/connect/callback/route.ts.
export async function GET(req: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
  if (!isGoogleCalendarConfigurado()) {
    return NextResponse.redirect(`${appUrl}/configuracion?google_calendar_error=Google%20Calendar%20no%20configurado`);
  }

  const code = req.nextUrl.searchParams.get('code');
  const oauthError = req.nextUrl.searchParams.get('error_description') ?? req.nextUrl.searchParams.get('error');

  if (oauthError) {
    return NextResponse.redirect(`${appUrl}/configuracion?google_calendar_error=${encodeURIComponent(oauthError)}`);
  }
  // C-8: studioId desde el `state` FIRMADO (ver lib/oauth-state.ts), no de un id
  // en claro. Evita injertar los tokens de Google en un estudio ajeno (CSRF).
  const verificado = verificarEstadoOAuth(req.nextUrl.searchParams.get('state'), 'google', Date.now());
  if (!code || !verificado) {
    return NextResponse.redirect(`${appUrl}/configuracion?google_calendar_error=Estado%20de%20conexi%C3%B3n%20inv%C3%A1lido%20o%20caducado`);
  }
  const studioId = verificado.studioId;

  try {
    const tokens = await exchangeCodeForTokens(code);
    const email = await getGoogleAccountEmail(tokens.accessToken);
    await dbSaveGoogleCalendarCredenciales(studioId, tokens);
    await dbSetGoogleCalendarEmail(studioId, email);
    return NextResponse.redirect(`${appUrl}/configuracion?google_calendar_connected=1`);
  } catch (err) {
    console.error('[integrations/google-calendar/callback]', err instanceof Error ? err.message : err);
    return NextResponse.redirect(`${appUrl}/configuracion?google_calendar_error=${encodeURIComponent('No se pudo completar la conexión con Google Calendar. Inténtalo de nuevo.')}`);
  }
}
