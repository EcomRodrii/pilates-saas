import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { emitirClaseModificada } from '@/lib/notifications/emit';

// Avisa (in-app/push) a las socias apuntadas de que su clase ha cambiado de
// horario/sala. El cliente envía los datos NUEVOS ya formateados (evita leer la
// sesión antes de que la escritura optimista llegue a la BD). Best-effort.
export async function POST(req: NextRequest) {
  const staff = await verificarSesionStaff(req);
  if (!staff) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ ok: true, skipped: true });

  const b = (await req.json().catch(() => null)) as
    | { sesionId?: string; clase?: string; cuando?: string; sala?: string }
    | null;
  if (!b?.sesionId) return NextResponse.json({ error: 'Falta sesionId' }, { status: 400 });

  const { data: ses } = await admin.from('sesiones')
    .select('id').eq('id', b.sesionId).eq('studio_id', staff.studioId).maybeSingle();
  if (!ses) return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 });

  await emitirClaseModificada(admin, {
    studioId: staff.studioId, sesionId: b.sesionId,
    clase: b.clase || 'tu clase', cuando: b.cuando || '', sala: b.sala || '',
  });
  return NextResponse.json({ ok: true });
}
