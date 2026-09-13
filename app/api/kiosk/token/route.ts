import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { hashToken } from '@/lib/token-hash';

// C-2: genera/rota el token de dispositivo del kiosko del estudio. Solo el
// PROPIETARIO autenticado. En la BD se guarda SOLO su SHA-256, en
// `kiosko_tokens` (service-role, sin grants a clientes; migr 20260914110000):
// el token en claro sale una única vez en esta respuesta para copiarlo al
// dispositivo de recepción, y nadie del equipo puede volver a leerlo. Rotar
// sustituye el hash, así que el dispositivo anterior deja de valer.
// /api/public/checkin lo exige en la cabecera x-kiosk-token.
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
  const { error } = await admin.from('kiosko_tokens').upsert(
    { studio_id: sesion.studioId, token_hash: hashToken(token), actualizado_en: new Date().toISOString() },
    { onConflict: 'studio_id' },
  );
  if (error) {
    return NextResponse.json({ error: 'No se pudo generar el token' }, { status: 500 });
  }
  return NextResponse.json({ token }, { headers: { 'Cache-Control': 'no-store' } });
}
