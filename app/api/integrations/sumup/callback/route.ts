import { NextRequest, NextResponse } from 'next/server';
import { canjearCodigoSumup, perfilSumup, sumupConfigurado } from '@/lib/pos/sumup-oauth';
import { dbGetSumupCredenciales, dbSaveSumupCredenciales } from '@/lib/db/supabase-data-admin';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { borrarCookieOAuth, nombreCookieOAuth, verificarEstadoOAuth } from '@/lib/oauth-state';
import { uid } from '@/lib/utils';
import { cobrosSumupEnVuelo } from '@/lib/pos/sumup-lector-servidor';
import type { FalloConexionSumup } from '@/lib/pos/sumup';

// ─────────────────────────────────────────────────────────────────────────────
// Vuelta de SumUp tras autorizar la cuenta del estudio (OAuth). Mismo patrón que
// Zoom: el `state` firmado y la cookie del flujo dicen de qué estudio es (lo pidió
// la dueña en /api/integrations/oauth-state). Los tokens se guardan cifrados con
// el `merchant_code` de la cuenta, que va en todas las rutas de la API de SumUp.
//
// Vuelve a Configuración → Datáfono con `sumup_conectado=1`, que abre el paso de
// escribir el código del Solo. Si se conecta una cuenta DISTINTA de la que había,
// su Solo era de la otra: se olvida (no se le podría mandar nada).
//
// ⚠️ Con un cobro de SumUp en marcha no se cambia de cuenta: su resultado solo lo
// sabe la cuenta que lo cobró, y con otra el barrido lo daría por no empezado.
//
// Los fallos vuelven como un CÓDIGO (`FalloConexionSumup`), nunca con texto de la
// URL de vuelta: la pantalla enseña un texto fijo por código.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
  const redirigir = (query: string) => {
    const res = NextResponse.redirect(`${appUrl}/configuracion?tab=cobros&${query}#datafono`);
    borrarCookieOAuth(res, 'sumup');
    return res;
  };
  const fallo = (codigo: FalloConexionSumup) => redirigir(`sumup_error=${codigo}`);
  if (!sumupConfigurado()) return fallo('no-disponible');

  const code = req.nextUrl.searchParams.get('code');
  const oauthError = req.nextUrl.searchParams.get('error');
  if (oauthError) {
    console.error('[integrations/sumup/callback] SumUp devolvió', oauthError);
    return fallo(oauthError === 'access_denied' ? 'cancelado' : 'fallo');
  }

  const verificado = verificarEstadoOAuth(
    req.nextUrl.searchParams.get('state'), 'sumup', Date.now(),
    req.cookies.get(nombreCookieOAuth('sumup'))?.value,
  );
  if (!code || !verificado) return fallo('caducado');
  const studioId = verificado.studioId;
  const admin = getSupabaseAdmin();
  if (!admin) return fallo('fallo');

  try {
    const tokens = await canjearCodigoSumup(code);
    const perfil = await perfilSumup(tokens.accessToken);
    const antes = await dbGetSumupCredenciales(studioId);
    const cambiaDeCuenta = !antes || antes.merchantCode !== perfil.merchantCode;
    if (cambiaDeCuenta && (await cobrosSumupEnVuelo(admin, studioId)) !== 0) return fallo('cobro-en-marcha');
    await dbSaveSumupCredenciales(studioId, { ...tokens, ...perfil });

    // Otra cuenta: su Solo era de la anterior y no se le podría mandar nada.
    if (antes && cambiaDeCuenta) {
      await admin.from('studios').update({ sumup_reader_id: null }).eq('id', studioId);
    }

    // Constancia en Actividad: es la cuenta donde caen los cobros del datáfono.
    // Fail-soft: la conexión ya está guardada.
    const { error: errLog } = await admin.from('actividad_reciente').insert({
      id: uid(), studio_id: studioId, tipo: 'CUENTA_COBRO_CAMBIADA',
      texto: `SumUp conectado al estudio${perfil.nombreComercio ? ` (${perfil.nombreComercio})` : ''}`,
      socio_id: null, enlace: '/configuracion?tab=cobros#datafono', creado_en: new Date().toISOString(), actor_nombre: null,
    });
    if (errLog) console.error('[integrations/sumup/callback] registro de actividad', errLog.message);
    return redirigir('sumup_conectado=1');
  } catch (err) {
    console.error('[integrations/sumup/callback]', err instanceof Error ? err.message : err);
    return fallo('fallo');
  }
}
