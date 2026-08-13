import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { dbSetKlaviyoAccountName, dbDeleteKlaviyoCredenciales, dbGetKlaviyoCredenciales } from '@/lib/db/supabase-data-admin';
import { revocarToken } from '@/lib/klaviyo';

// Mismo patrón que app/api/integrations/google-calendar/disconnect: borra el
// token guardado (con revocación best-effort en Klaviyo) y limpia el nombre
// de cuenta que usa la UI para pintar "Conectado".
export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  if (sesion.rol !== 'PROPIETARIO') {
    return NextResponse.json({ error: 'Solo la propietaria puede desconectar integraciones' }, { status: 403 });
  }

  const creds = await dbGetKlaviyoCredenciales(sesion.studioId);
  if (creds) await revocarToken(creds.refreshToken);
  await dbDeleteKlaviyoCredenciales(sesion.studioId);
  await dbSetKlaviyoAccountName(sesion.studioId, null);

  return NextResponse.json({ ok: true });
}
