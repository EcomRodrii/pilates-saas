import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { firmarTokenInstructora } from '@/lib/sustituciones/token';

// Genera el deep link firmado que la propietaria envía a una instructora para
// que rellene su disponibilidad (sin login). Solo la propietaria del estudio.
// El enlace no expone datos: es {payload firmado}.hmac, válido 30 días.
export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol !== 'PROPIETARIO') {
    return NextResponse.json({ error: 'Solo la propietaria puede generar enlaces' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { instructorId?: string } | null;
  const instructorId = typeof body?.instructorId === 'string' ? body.instructorId : null;
  if (!instructorId) return NextResponse.json({ error: 'Falta instructorId' }, { status: 400 });

  // La instructora debe pertenecer al estudio de quien pide el enlace.
  const { data: instructora } = await admin
    .from('instructores').select('id, nombre')
    .eq('id', instructorId).eq('studio_id', sesion.studioId).maybeSingle();
  if (!instructora) return NextResponse.json({ error: 'Instructora no encontrada' }, { status: 404 });

  const token = firmarTokenInstructora(instructorId, sesion.studioId, 'disponibilidad');
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
  const url = `${appUrl}/disponibilidad/${token}`;

  return NextResponse.json({ url, instructorNombre: instructora.nombre });
}
