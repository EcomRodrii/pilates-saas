import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { dbSetZoomEmail, dbDeleteZoomCredenciales, dbGetZoomCredenciales } from '@/lib/supabase-data';
import { revocarToken } from '@/lib/zoom';

// Mismo patrón que app/api/integrations/google-calendar/disconnect: borra el
// token guardado en servidor y limpia el email de referencia que usa la UI
// para pintar "Conectado".
export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  if (sesion.rol !== 'PROPIETARIO') {
    return NextResponse.json({ error: 'Solo la propietaria puede desconectar integraciones' }, { status: 403 });
  }

  const creds = await dbGetZoomCredenciales(sesion.studioId);
  if (creds) await revocarToken(creds.accessToken);
  await dbDeleteZoomCredenciales(sesion.studioId);
  await dbSetZoomEmail(sesion.studioId, null);

  return NextResponse.json({ ok: true });
}
