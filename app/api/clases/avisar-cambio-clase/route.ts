import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { emitirClaseModificada } from '@/lib/notifications/emit';
import { sociasDeSesion } from '@/lib/notifications/recipients';
import { enviarEmailesCambioClase } from '@/lib/emails/enviar-cambio-clase';

// Avisa (email + in-app) a las socias apuntadas de un cambio de instructora
// y/o de horario/sala. A diferencia del viejo flujo (el panel filtraba su
// propio array `reservas`/`socios` en cliente para decidir a quién mandar el
// email), las destinatarias se resuelven aquí contra la BD en el momento del
// envío — mismo criterio para ambos motivos de cambio, en una sola llamada
// (evita mandar el in-app dos veces si además se llamara aparte a
// avisar-modificada; `emitirClaseModificada` es idempotente por dedupKey de
// todas formas, pero no hace falta la doble llamada).
export async function POST(req: NextRequest) {
  const staff = await verificarSesionStaff(req);
  if (!staff) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ ok: true, skipped: true });

  const b = (await req.json().catch(() => null)) as {
    sesionId?: string; clase?: string; cuando?: string; sala?: string;
    instructora?: string; instructorActual?: string;
    fecha?: string; hora?: string; instructorAnterior?: string;
    cambioHora?: boolean; cambioSala?: boolean;
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

  // El email siempre dice quién da la clase AHORA (instructorActual), aunque
  // solo se haya movido la hora o la sala; el in-app usa `instructora`
  // (vacía si no cambió), igual que antes.
  const { enviados, sinEmail } = await enviarEmailesCambioClase(staff.studioId, conEmail, {
    claseNombre: b.clase || 'tu clase', fecha: b.fecha || '', hora: b.hora || '',
    sala: b.sala || '', instructor: b.instructorActual || b.instructora || '', instructorAnterior: b.instructorAnterior,
    cambioHora: b.cambioHora, cambioSala: b.cambioSala,
  });

  const enApp = await emitirClaseModificada(admin, {
    studioId: staff.studioId, sesionId: b.sesionId,
    clase: b.clase || 'tu clase', cuando: b.cuando || '', sala: b.sala || '',
    instructora: b.instructora || '',
  });

  return NextResponse.json({ ok: true, enviados, sinEmail: sinEmailPrevio + sinEmail, enApp });
}
