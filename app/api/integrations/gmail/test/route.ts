import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { getValidAccessToken, enviarEmailGmail } from '@/lib/gmail';

// Envía un email de prueba a la propia cuenta de Gmail conectada — la forma
// más segura de demostrar que el envío funciona: nunca llega a una clienta
// real, solo confirma que el token tiene permiso de gmail.send.
export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const accessToken = await getValidAccessToken(sesion.studioId);
  if (!accessToken) {
    return NextResponse.json({ error: 'Este estudio no tiene Gmail conectado' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { data: studio } = admin
    ? await admin.from('studios').select('gmail_email, nombre').eq('id', sesion.studioId).maybeSingle()
    : { data: null };
  if (!studio?.gmail_email) {
    return NextResponse.json({ error: 'No se encuentra el email de la cuenta conectada' }, { status: 400 });
  }

  const r = await enviarEmailGmail(accessToken, {
    from: studio.gmail_email,
    to: studio.gmail_email,
    asunto: 'Prueba de conexión — Tentare',
    cuerpo: `Este es un email de prueba enviado desde el Gmail conectado de ${studio.nombre ?? 'tu estudio'}. Si lo has recibido, la conexión funciona correctamente.`,
  });

  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502 });
  return NextResponse.json({ ok: true });
}
