import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { emitirClaseModificada } from '@/lib/notifications/emit';
import { sociasDeSesion } from '@/lib/notifications/recipients';
import { enviarEmailesCambioInstructora } from '@/lib/emails/enviar-cambio-instructora';

// Avisa (email + in-app) a las socias apuntadas de un cambio de instructora.
// A diferencia del viejo flujo (el panel filtraba su propio array `reservas` en
// cliente para decidir a quién mandar el email), las destinatarias se resuelven
// aquí contra la BD en el momento del envío — el mismo snapshot desactualizado
// que ya se corrigió para HORA/SALA (ver comentario en editarSesion, page.tsx).
export async function POST(req: NextRequest) {
  const staff = await verificarSesionStaff(req);
  if (!staff) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ ok: true, skipped: true });

  const b = (await req.json().catch(() => null)) as {
    sesionId?: string; clase?: string; cuando?: string; sala?: string; instructora?: string;
    fecha?: string; hora?: string; instructorAnterior?: string;
  } | null;
  if (!b?.sesionId) return NextResponse.json({ error: 'Falta sesionId' }, { status: 400 });

  const { data: ses } = await admin.from('sesiones')
    .select('id').eq('id', b.sesionId).eq('studio_id', staff.studioId).maybeSingle();
  if (!ses) return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 });

  const destinatarias = await sociasDeSesion(admin, staff.studioId, b.sesionId);
  const conEmail = destinatarias
    .filter((d): d is typeof d & { email: string } => !!d.email)
    .map(d => ({ email: d.email, nombre: d.nombre ?? 'Socia' }));
  const sinEmailPrevio = destinatarias.length - conEmail.length;

  const { enviados, sinEmail } = await enviarEmailesCambioInstructora(staff.studioId, conEmail, {
    claseNombre: b.clase || 'tu clase', fecha: b.fecha || '', hora: b.hora || '',
    sala: b.sala || '', instructor: b.instructora || '', instructorAnterior: b.instructorAnterior,
  });

  const enApp = await emitirClaseModificada(admin, {
    studioId: staff.studioId, sesionId: b.sesionId,
    clase: b.clase || 'tu clase', cuando: b.cuando || '', sala: b.sala || '',
    instructora: b.instructora || '',
  });

  return NextResponse.json({ ok: true, enviados, sinEmail: sinEmailPrevio + sinEmail, enApp });
}
