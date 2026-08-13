import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { firmarEstadoOAuth } from '@/lib/oauth-state';
import { generarPkce } from '@/lib/marketing/pkce';

const PROVIDERS = ['stripe', 'google', 'gmail', 'zoom', 'klaviyo'] as const;
type ProviderValido = (typeof PROVIDERS)[number];

// C-8: emite el `state` firmado para iniciar un flujo OAuth (Stripe Connect /
// Google Calendar / Klaviyo...). Solo el PROPIETARIO autenticado, y el state
// queda ligado a SU studioId — el callback ya no se fía de un id en claro
// del navegador.
export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion || sesion.rol !== 'PROPIETARIO') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const body = await req.json().catch(() => null) as { provider?: string } | null;
  if (!body?.provider || !PROVIDERS.includes(body.provider as ProviderValido)) {
    return NextResponse.json({ error: 'Proveedor no válido' }, { status: 400 });
  }
  const provider = body.provider as ProviderValido;

  try {
    // Klaviyo exige PKCE (ver lib/oauth-state.ts) — el code_verifier viaja
    // DENTRO del state firmado, así que el cliente nunca lo maneja: solo
    // recibe el code_challenge para construir la URL de autorización.
    if (provider === 'klaviyo') {
      const { codeVerifier, codeChallenge } = generarPkce();
      const state = firmarEstadoOAuth(sesion.studioId, provider, Date.now(), codeVerifier);
      return NextResponse.json({ state, codeChallenge });
    }
    const state = firmarEstadoOAuth(sesion.studioId, provider, Date.now());
    return NextResponse.json({ state });
  } catch {
    return NextResponse.json({ error: 'OAUTH_STATE_SECRET no configurada' }, { status: 503 });
  }
}
