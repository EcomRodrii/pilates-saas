import { NextRequest, NextResponse } from 'next/server';
import { canjearCodigoSumup, merchantCodeSumup, sumupConfigurado } from '@/lib/pos/sumup-oauth';
import { dbSaveSumupCredenciales } from '@/lib/db/supabase-data-admin';
import { borrarCookieOAuth, nombreCookieOAuth, verificarEstadoOAuth } from '@/lib/oauth-state';

// ─────────────────────────────────────────────────────────────────────────────
// Vuelta de SumUp tras autorizar la cuenta del estudio (OAuth). Mismo patrón que
// Zoom: el `state` firmado y la cookie del flujo dicen de qué estudio es (lo pidió
// la dueña en /api/integrations/oauth-state). Los tokens se guardan cifrados con
// el `merchant_code` de la cuenta, que va en todas las rutas de la API de SumUp.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
  const redirigir = (query: string) => {
    const res = NextResponse.redirect(`${appUrl}/configuracion?tab=cobros&${query}#datafono`);
    borrarCookieOAuth(res, 'sumup');
    return res;
  };
  if (!sumupConfigurado()) return redirigir('sumup_error=SumUp%20no%20disponible');

  const code = req.nextUrl.searchParams.get('code');
  const oauthError = req.nextUrl.searchParams.get('error_description') ?? req.nextUrl.searchParams.get('error');
  if (oauthError) return redirigir(`sumup_error=${encodeURIComponent(oauthError)}`);

  const verificado = verificarEstadoOAuth(
    req.nextUrl.searchParams.get('state'), 'sumup', Date.now(),
    req.cookies.get(nombreCookieOAuth('sumup'))?.value,
  );
  if (!code || !verificado) {
    return redirigir('sumup_error=Estado%20de%20conexi%C3%B3n%20inv%C3%A1lido%20o%20caducado');
  }

  try {
    const tokens = await canjearCodigoSumup(code);
    const merchantCode = await merchantCodeSumup(tokens.accessToken);
    await dbSaveSumupCredenciales(verificado.studioId, { ...tokens, merchantCode });
    return redirigir('sumup_conectado=1');
  } catch (err) {
    console.error('[integrations/sumup/callback]', err instanceof Error ? err.message : err);
    return redirigir(`sumup_error=${encodeURIComponent('No se pudo completar la conexión con SumUp. Inténtalo de nuevo.')}`);
  }
}
