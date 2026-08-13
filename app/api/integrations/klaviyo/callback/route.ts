import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForTokens, getAccountName, crearListaMarketing, isKlaviyoConfigurado } from '@/lib/klaviyo';
import { dbSaveKlaviyoCredenciales, dbSetKlaviyoAccountName } from '@/lib/db/supabase-data-admin';
import { verificarEstadoOAuth } from '@/lib/oauth-state';

// Vuelta del OAuth de Klaviyo (botón "Conectar con Klaviyo" en Configuración
// → Integraciones) — mismo patrón que
// app/api/integrations/google-calendar/callback/route.ts, con dos
// diferencias: PKCE (code_verifier sale del propio `state` firmado, ver
// lib/oauth-state.ts) y la creación de la lista de sincronización en el
// primer connect.
export async function GET(req: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
  if (!isKlaviyoConfigurado()) {
    return NextResponse.redirect(`${appUrl}/configuracion?klaviyo_error=Klaviyo%20no%20configurado`);
  }

  const code = req.nextUrl.searchParams.get('code');
  const oauthError = req.nextUrl.searchParams.get('error_description') ?? req.nextUrl.searchParams.get('error');
  if (oauthError) {
    return NextResponse.redirect(`${appUrl}/configuracion?klaviyo_error=${encodeURIComponent(oauthError)}`);
  }

  // C-8: studioId (y aquí también el code_verifier de PKCE) desde el `state`
  // FIRMADO, no de un id en claro — evita injertar los tokens de Klaviyo en
  // un estudio ajeno (CSRF de binding).
  const verificado = verificarEstadoOAuth(req.nextUrl.searchParams.get('state'), 'klaviyo', Date.now());
  if (!code || !verificado || !verificado.codeVerifier) {
    return NextResponse.redirect(`${appUrl}/configuracion?klaviyo_error=Estado%20de%20conexi%C3%B3n%20inv%C3%A1lido%20o%20caducado`);
  }
  const studioId = verificado.studioId;

  try {
    const tokens = await exchangeCodeForTokens(code, verificado.codeVerifier);
    // La lista se crea UNA vez, en el connect inicial — un reconecte con
    // credenciales nuevas no debe duplicarla, así que si algo falla al crear
    // la lista, igualmente se guardan los tokens (el estudio queda
    // "conectado sin lista" y puede reintentar sincronizar más tarde).
    let listId: string | null = null;
    try {
      listId = await crearListaMarketing(tokens.accessToken);
    } catch (e) {
      console.error('[integrations/klaviyo/callback] crearListaMarketing:', e instanceof Error ? e.message : e);
    }
    await dbSaveKlaviyoCredenciales(studioId, { ...tokens, listId });
    const nombre = await getAccountName(tokens.accessToken);
    await dbSetKlaviyoAccountName(studioId, nombre);
    return NextResponse.redirect(`${appUrl}/configuracion?klaviyo_connected=1`);
  } catch (err) {
    console.error('[integrations/klaviyo/callback]', err instanceof Error ? err.message : err);
    return NextResponse.redirect(`${appUrl}/configuracion?klaviyo_error=${encodeURIComponent('No se pudo completar la conexión con Klaviyo. Inténtalo de nuevo.')}`);
  }
}
