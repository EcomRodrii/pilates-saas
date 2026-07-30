import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { dbSetGoogleCalendarEmail, dbDeleteGoogleCalendarCredenciales, dbGetGoogleCalendarCredenciales } from '@/lib/supabase-data';
import { revocarToken } from '@/lib/google-calendar';

// A diferencia del "desconectar" de Stripe (que solo borra el estado local
// en el navegador y nunca llega a tocar la BD — deuda ya detectada), esto
// desconecta de verdad en servidor: borra el token guardado y limpia el
// email de referencia que usa la UI para pintar "Conectado".
export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  if (sesion.rol !== 'PROPIETARIO') {
    return NextResponse.json({ error: 'Solo la propietaria puede desconectar integraciones' }, { status: 403 });
  }

  const creds = await dbGetGoogleCalendarCredenciales(sesion.studioId);
  if (creds) await revocarToken(creds.refreshToken);
  await dbDeleteGoogleCalendarCredenciales(sesion.studioId);
  await dbSetGoogleCalendarEmail(sesion.studioId, null);

  return NextResponse.json({ ok: true });
}
