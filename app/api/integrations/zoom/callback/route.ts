import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForTokens, getZoomAccountEmail, isZoomConfigurado } from '@/lib/zoom';
import { dbSetZoomEmail, dbSaveZoomCredenciales } from '@/lib/db/supabase-data-admin';
import { borrarCookieOAuth, nombreCookieOAuth, verificarEstadoOAuth } from '@/lib/oauth-state';

// Vuelta del OAuth de Zoom (botón "Conectar cuenta de Zoom" en Configuración
// → Integraciones). Cambia el `code` de un solo uso por un access/refresh
// token y los guarda para ese estudio — mismo patrón que
// app/api/integrations/google-calendar/callback/route.ts.
export async function GET(req: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
  // H-1: la cookie del flujo es de un solo uso — se borra en TODAS las salidas.
  const redirigir = (query: string) => {
    const res = NextResponse.redirect(`${appUrl}/configuracion?${query}`);
    borrarCookieOAuth(res, 'zoom');
    return res;
  };
  if (!isZoomConfigurado()) {
    return redirigir('zoom_error=Zoom%20no%20configurado');
  }

  const code = req.nextUrl.searchParams.get('code');
  const oauthError = req.nextUrl.searchParams.get('error_description') ?? req.nextUrl.searchParams.get('error');

  if (oauthError) {
    return redirigir(`zoom_error=${encodeURIComponent(oauthError)}`);
  }
  // C-8: studioId desde el `state` FIRMADO (ver lib/oauth-state.ts), no de un id
  // en claro. Evita injertar los tokens de Zoom en un estudio ajeno (CSRF).
  // H-1: y solo junto a la cookie que se fijó en ESTE navegador al pedirlo.
  const verificado = verificarEstadoOAuth(
    req.nextUrl.searchParams.get('state'), 'zoom', Date.now(),
    req.cookies.get(nombreCookieOAuth('zoom'))?.value,
  );
  if (!code || !verificado) {
    return redirigir('zoom_error=Estado%20de%20conexi%C3%B3n%20inv%C3%A1lido%20o%20caducado');
  }
  const studioId = verificado.studioId;

  try {
    const tokens = await exchangeCodeForTokens(code);
    const email = await getZoomAccountEmail(tokens.accessToken);
    await dbSaveZoomCredenciales(studioId, tokens);
    await dbSetZoomEmail(studioId, email);
    return redirigir('zoom_connected=1');
  } catch (err) {
    console.error('[integrations/zoom/callback]', err instanceof Error ? err.message : err);
    return redirigir(`zoom_error=${encodeURIComponent('No se pudo completar la conexión con Zoom. Inténtalo de nuevo.')}`);
  }
}
