import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { emitirClaseCancelada } from '@/lib/notifications/emit';
import { clasesParaAviso } from '@/lib/avisos-clase-servidor';

// Avisa (in-app/push, vía Notification Engine) a las socias apuntadas de que su
// clase se ha cancelado desde el calendario. El email ya lo manda el propio
// panel; esto añade la notificación in-app/push que faltaba. Best-effort.
export async function POST(req: NextRequest) {
  const staff = await verificarSesionStaff(req);
  if (!staff) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ ok: true, skipped: true });

  const body = (await req.json().catch(() => null)) as { sesionId?: string } | null;
  const sesionId = typeof body?.sesionId === 'string' ? body.sesionId : null;
  if (!sesionId) return NextResponse.json({ error: 'Falta sesionId' }, { status: 400 });

  // La sesión debe ser de SU estudio y poder tocarla quien llama: mostrador y
  // manager cualquiera, la instructora solo la suya (`puedeOperarClase`).
  const r = await clasesParaAviso(admin, staff, [sesionId]);
  if (!r) return NextResponse.json({ error: 'No se ha podido comprobar la clase.' }, { status: 500 });
  if (r.ajenas > 0) return NextResponse.json({ error: 'No tienes permiso para avisar de esta clase.' }, { status: 403 });
  const clase = r.clases[0];
  if (!clase) return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 });

  // Solo se avisa de una cancelación que ya está en la BD. Quien cancela marca
  // la clase antes de avisar (calendario, serie y «Eliminar»).
  if (!clase.cancelada) {
    return NextResponse.json({ error: 'Esa clase no está cancelada.' }, { status: 409 });
  }

  await emitirClaseCancelada(admin, { studioId: staff.studioId, sesionId });
  return NextResponse.json({ ok: true });
}
