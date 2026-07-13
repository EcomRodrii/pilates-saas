import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// C-2: genera/rota el token de dispositivo del kiosko del estudio. Solo el
// PROPIETARIO autenticado. El token se guarda en studios.kiosk_token (service
// role) y se muestra una vez en Configuración para copiarlo al dispositivo de
// recepción. /api/public/checkin lo exige en la cabecera x-kiosk-token.
export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion || sesion.rol !== 'PROPIETARIO') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Servicio no configurado (service role)' }, { status: 503 });
  }
  const token = randomBytes(24).toString('base64url');
  const { error } = await admin.from('studios').update({ kiosk_token: token }).eq('id', sesion.studioId);
  if (error) {
    return NextResponse.json({ error: 'No se pudo generar el token' }, { status: 500 });
  }
  return NextResponse.json({ token });
}
