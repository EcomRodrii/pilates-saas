import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { emitirClaseCreadaPorInstructor } from '@/lib/notifications/emit';

// Avisa (in-app, vía Notification Engine) a la propietaria de que una
// instructora ha creado una clase nueva desde su panel (autoservicio,
// migración 20260731100000). Best-effort, no bloquea el alta.
export async function POST(req: NextRequest) {
  const staff = await verificarSesionStaff(req);
  if (!staff) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (staff.rol !== 'INSTRUCTOR') return NextResponse.json({ ok: true, skipped: true });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ ok: true, skipped: true });

  const body = (await req.json().catch(() => null)) as { sesionId?: string } | null;
  const sesionId = body?.sesionId;
  if (!sesionId) return NextResponse.json({ error: 'Falta sesionId' }, { status: 400 });

  // La sesión debe ser de SU estudio y suya — mismo criterio que la RLS de
  // INSERT (20260731100000): no se fía de lo que mande el cliente.
  const { data: yo } = await admin
    .from('instructores').select('id')
    .eq('auth_user_id', staff.userId).eq('studio_id', staff.studioId)
    .neq('activo', false).order('id', { ascending: true }).limit(1);
  const instructorId = yo?.[0]?.id as string | undefined;
  if (!instructorId) return NextResponse.json({ ok: true, skipped: true });

  const { data: ses } = await admin.from('sesiones')
    .select('id').eq('id', sesionId).eq('studio_id', staff.studioId).eq('instructor_id', instructorId).maybeSingle();
  if (!ses) return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 });

  await emitirClaseCreadaPorInstructor(admin, { studioId: staff.studioId, sesionId, instructorId });
  return NextResponse.json({ ok: true });
}
