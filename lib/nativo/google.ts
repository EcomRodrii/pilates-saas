// «Continuar con Google» dentro de la app de iOS (docs/APP-IOS.md).
//
// Google no deja iniciar sesión desde un WebView (la app es la web dentro de uno),
// así que se abre en un Safari por encima (`loginConGoogleNativo`, lib/nativo/
// puente.ts) y vuelve a la app por su esquema propio: `<bundle id>://auth/vuelta`.
//
// ⚠️ Por el esquema propio vuelve un CÓDIGO, nunca los tokens: otra app podría
// registrar el mismo esquema y quedarse con lo que llegue por ahí. Por eso PKCE:
// el código solo se canjea con el verificador, que nunca sale de este WebView.
// `supabasePortal` usa el flujo implícito (los enlaces del correo de toda la vida
// dependen de él), así que el canje lo hace un cliente de auth de un solo uso, con
// PKCE y la memoria como almacén, y la sesión que sale se entrega al cliente de
// siempre (`setSession`): desde ahí todo sigue igual que con el correo o Apple.
//
// En Supabase, `<bundle id>://auth/vuelta` tiene que estar en «Redirect URLs».

import { AuthClient } from '@supabase/auth-js';
import { supabasePortal } from '../db/supabase-portal.ts';
import { bundleIdDeLaApp, loginConGoogleNativo } from './puente.ts';
import { resultadoDeVuelta } from './enlaces.ts';

const PREFIJO_VUELTA = '/auth/vuelta';

export type ResultadoGoogle = { ok: true } | { cancelado: true } | { error: string };

function almacenEnMemoria() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
  };
}

export async function entrarConGoogleEnLaApp(): Promise<ResultadoGoogle> {
  const bundleId = await bundleIdDeLaApp();
  if (!bundleId) return { error: 'Solo funciona dentro de la app.' };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const canje = new AuthClient({
    url: new URL('auth/v1', url).href,
    headers: { Authorization: `Bearer ${anon}`, apikey: anon },
    storageKey: 'sb-portal-google-app',
    storage: almacenEnMemoria(),
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  });

  const { data, error } = await canje.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${bundleId}:/${PREFIJO_VUELTA}`,
      skipBrowserRedirect: true,
      // Solo lo mínimo para autenticar, como en la web.
      scopes: 'openid email profile',
      queryParams: { prompt: 'select_account' },
    },
  });
  if (error || !data?.url) return { error: 'No hemos podido abrir Google. Inténtalo de nuevo.' };

  const vuelta = await loginConGoogleNativo(data.url, PREFIJO_VUELTA);
  if ('error' in vuelta) {
    return vuelta.error === 'cancelado' ? { cancelado: true } : { error: 'No se ha podido entrar con Google. Inténtalo de nuevo.' };
  }
  const r = resultadoDeVuelta(vuelta.ruta);
  if (!r) return { error: 'No se ha podido entrar con Google. Inténtalo de nuevo.' };
  // `access_denied`: dijo que no en la pantalla de Google. No es un fallo.
  if ('error' in r) return /access_denied/i.test(r.error) ? { cancelado: true } : { error: 'Google no ha dejado entrar. Inténtalo de nuevo.' };

  const { data: canjeado, error: errCanje } = await canje.exchangeCodeForSession(r.codigo);
  if (errCanje || !canjeado.session) return { error: 'No se ha podido entrar con Google. Inténtalo de nuevo.' };
  const { error: errSesion } = await supabasePortal.auth.setSession({
    access_token: canjeado.session.access_token,
    refresh_token: canjeado.session.refresh_token,
  });
  return errSesion ? { error: 'Google ha dicho que sí, pero no hemos podido abrir tu sesión. Inténtalo de nuevo.' } : { ok: true };
}
