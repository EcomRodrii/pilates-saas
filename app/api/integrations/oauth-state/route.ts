import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { firmarEstadoOAuth } from '@/lib/oauth-state';

// C-8: emite el `state` firmado para iniciar un flujo OAuth (Stripe Connect /
// Google Calendar). Solo el PROPIETARIO autenticado, y el state queda ligado a
// SU studioId — el callback ya no se fía de un id en claro del navegador.
export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion || sesion.rol !== 'PROPIETARIO') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const body = await req.json().catch(() => null) as { provider?: 'stripe' | 'google' | 'gmail' | 'zoom' } | null;
  if (body?.provider !== 'stripe' && body?.provider !== 'google' && body?.provider !== 'gmail' && body?.provider !== 'zoom') {
    return NextResponse.json({ error: 'Proveedor no válido' }, { status: 400 });
  }

  try {
    const state = firmarEstadoOAuth(sesion.studioId, body.provider, Date.now());
    return NextResponse.json({ state });
  } catch {
    return NextResponse.json({ error: 'OAUTH_STATE_SECRET no configurada' }, { status: 503 });
  }
}
