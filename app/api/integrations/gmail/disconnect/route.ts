import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import {
  dbSetGmailEmail, dbDeleteGmailCredenciales, dbGetGmailCredenciales, dbGetGoogleCalendarCredenciales,
} from '@/lib/db/supabase-data-admin';
import { revocarToken } from '@/lib/gmail';
import { revocarGmailEnGoogle } from '@/lib/integraciones/desconectar-gmail';

const NO_SE_HA_PODIDO = 'No se ha podido desconectar Gmail. Vuelve a intentarlo.';

// Lo único que queda de Gmail (retirado el 1-oct-2026): desconectarlo. Borra el
// token guardado y el email que pinta la fila, y revoca el permiso en Google
// solo si eso no le corta Google Calendar (lib/integraciones/desconectar-gmail.ts).
export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  if (sesion.rol !== 'PROPIETARIO') {
    return NextResponse.json({ error: 'Solo la propietaria puede desconectar integraciones' }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado.' }, { status: 503 });
  // Sin saber con qué cuenta está Calendar no se toca nada: revocar a ciegas
  // podría cortárselo.
  const { data: cuentas, error } = await admin
    .from('studios').select('gmail_email, google_calendar_email').eq('id', sesion.studioId).maybeSingle();
  if (error || !cuentas) return NextResponse.json({ error: NO_SE_HA_PODIDO }, { status: 503 });

  const [creds, calendar] = await Promise.all([
    dbGetGmailCredenciales(sesion.studioId),
    dbGetGoogleCalendarCredenciales(sesion.studioId),
  ]);
  const revocar = revocarGmailEnGoogle({
    gmailEmail: cuentas.gmail_email,
    calendarConectado: !!calendar || !!cuentas.google_calendar_email,
    calendarEmail: cuentas.google_calendar_email,
  });
  if (creds && revocar) await revocarToken(creds.refreshToken);

  // Antes contestaba «ok» aunque no se borrara nada: la fila se iba y el token
  // seguía guardado.
  if (!await dbDeleteGmailCredenciales(sesion.studioId) || !await dbSetGmailEmail(sesion.studioId, null)) {
    return NextResponse.json({ error: NO_SE_HA_PODIDO }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
