import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { emitirClaseCancelada } from '@/lib/notifications/emit';

// Avisa (in-app/push, vía Notification Engine) a las socias apuntadas de que su
// clase se ha cancelado desde el calendario. El email ya lo manda el propio
// panel; esto añade la notificación in-app/push que faltaba. Best-effort.
export async function POST(req: NextRequest) {
  const staff = await verificarSesionStaff(req);
  if (!staff) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ ok: true, skipped: true });

  const body = (await req.json().catch(() => null)) as { sesionId?: string } | null;
  const sesionId = body?.sesionId;
  if (!sesionId) return NextResponse.json({ error: 'Falta sesionId' }, { status: 400 });

  // La sesión debe ser de SU estudio (no se fía del cliente).
  const { data: ses } = await admin.from('sesiones')
    .select('id').eq('id', sesionId).eq('studio_id', staff.studioId).maybeSingle();
  if (!ses) return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 });

  await emitirClaseCancelada(admin, { studioId: staff.studioId, sesionId });
  return NextResponse.json({ ok: true });
}
