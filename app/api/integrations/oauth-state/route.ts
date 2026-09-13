import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import {
  crearCookieOAuth, firmarEstadoOAuth, nombreCookieOAuth, opcionesCookieOAuth, type ProveedorOAuth,
} from '@/lib/oauth-state';
import { generarPkce } from '@/lib/marketing/pkce';

const PROVIDERS: readonly ProveedorOAuth[] = ['stripe', 'google', 'gmail', 'zoom', 'klaviyo'];

// C-8: emite el `state` firmado para iniciar un flujo OAuth (Stripe Connect /
// Google Calendar / Gmail / Zoom / Klaviyo). Solo el PROPIETARIO autenticado,
// y el state queda ligado a SU studioId — el callback ya no se fía de un id en
// claro del navegador.
//
// H-1: además, el state queda ligado a ESTE navegador. La respuesta fija una
// cookie HttpOnly acotada a la ruta del callback, y el state solo lleva su
// huella (ver lib/oauth-state.ts). Funciona porque el panel pide esto con un
// `fetch` al mismo origen, que acepta Set-Cookie por defecto, y el proveedor
// devuelve al callback con una navegación GET de nivel superior, a la que
// SameSite=Lax sí manda la cookie.
export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion || sesion.rol !== 'PROPIETARIO') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const body = await req.json().catch(() => null) as { provider?: string } | null;
  if (!body?.provider || !PROVIDERS.includes(body.provider as ProveedorOAuth)) {
    return NextResponse.json({ error: 'Proveedor no válido' }, { status: 400 });
  }
  const provider = body.provider as ProveedorOAuth;

  try {
    // Klaviyo exige PKCE: el code_verifier va en la cookie HttpOnly, no en el
    // state, que acaba en la URL y en el historial del navegador. El cliente
    // solo recibe el code_challenge para construir la URL de autorización.
    let codeChallenge: string | undefined;
    let valorCookie: string;
    if (provider === 'klaviyo') {
      const pkce = generarPkce();
      codeChallenge = pkce.codeChallenge;
      valorCookie = crearCookieOAuth(pkce.codeVerifier);
    } else {
      valorCookie = crearCookieOAuth();
    }
    const state = firmarEstadoOAuth(sesion.studioId, provider, Date.now(), valorCookie);

    const res = NextResponse.json(codeChallenge ? { state, codeChallenge } : { state });
    res.cookies.set(nombreCookieOAuth(provider), valorCookie, opcionesCookieOAuth(provider));
    res.headers.set('Cache-Control', 'no-store');
    return res;
  } catch {
    return NextResponse.json({ error: 'OAUTH_STATE_SECRET no configurada' }, { status: 503 });
  }
}
