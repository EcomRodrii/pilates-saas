import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { dbSetGoogleCalendarEmail, dbDeleteGoogleCalendarCredenciales } from '@/lib/supabase-data';

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

  await dbDeleteGoogleCalendarCredenciales(sesion.studioId);
  await dbSetGoogleCalendarEmail(sesion.studioId, null);

  return NextResponse.json({ ok: true });
}
