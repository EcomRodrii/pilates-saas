import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { verificarSesionStaff } from '@/lib/auth-server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { puedeGestionarAppsOAuth } from '@/lib/permisos-reglas';
import { revocarConsentimiento } from '@/lib/oauth-server';

// Revocación desde el panel (pantalla "Apps conectadas"). Autenticado con la
// sesión de staff — nada que ver con el token endpoint de RFC 7009, que es
// para que la propia app de terceros revoque SU token; aquí es la
// propietaria/manager cortando el acceso desde Tentare.
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'oauth-revoke', { max: 20, windowSeconds: 60 });
  if (limited) return limited;

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (!puedeGestionarAppsOAuth(sesion.rol)) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });
  }

  const body = await req.json().catch(() => null) as { clienteId?: string } | null;
  if (!body?.clienteId) return NextResponse.json({ error: 'Falta clienteId' }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  await revocarConsentimiento(admin, sesion.studioId, body.clienteId);
  return NextResponse.json({ ok: true });
}
