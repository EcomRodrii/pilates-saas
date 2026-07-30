import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { dbSetGmailEmail, dbDeleteGmailCredenciales, dbGetGmailCredenciales } from '@/lib/supabase-data';
import { revocarToken } from '@/lib/gmail';

// Mismo patrón que app/api/integrations/google-calendar/disconnect: borra el
// token guardado y limpia el email de referencia que usa la UI.
export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  if (sesion.rol !== 'PROPIETARIO') {
    return NextResponse.json({ error: 'Solo la propietaria puede desconectar integraciones' }, { status: 403 });
  }

  const creds = await dbGetGmailCredenciales(sesion.studioId);
  if (creds) await revocarToken(creds.refreshToken);
  await dbDeleteGmailCredenciales(sesion.studioId);
  await dbSetGmailEmail(sesion.studioId, null);

  return NextResponse.json({ ok: true });
}
