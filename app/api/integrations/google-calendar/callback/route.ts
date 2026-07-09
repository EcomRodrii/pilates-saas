import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForTokens, getGoogleAccountEmail, isGoogleCalendarConfigurado } from '@/lib/google-calendar';
import { dbSetGoogleCalendarEmail, dbSaveGoogleCalendarCredenciales } from '@/lib/supabase-data';

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
  const studioId = req.nextUrl.searchParams.get('state');
  const oauthError = req.nextUrl.searchParams.get('error_description') ?? req.nextUrl.searchParams.get('error');

  if (oauthError) {
    return NextResponse.redirect(`${appUrl}/configuracion?google_calendar_error=${encodeURIComponent(oauthError)}`);
  }
  if (!code || !studioId) {
    return NextResponse.redirect(`${appUrl}/configuracion?google_calendar_error=Faltan%20datos%20de%20Google`);
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const email = await getGoogleAccountEmail(tokens.accessToken);
    await dbSaveGoogleCalendarCredenciales(studioId, tokens);
    await dbSetGoogleCalendarEmail(studioId, email);
    return NextResponse.redirect(`${appUrl}/configuracion?google_calendar_connected=1`);
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : 'Error desconocido al conectar con Google Calendar';
    return NextResponse.redirect(`${appUrl}/configuracion?google_calendar_error=${encodeURIComponent(mensaje)}`);
  }
}
