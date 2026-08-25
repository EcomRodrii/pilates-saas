'use server';

import { requireAuthInServerAction } from '@/lib/auth-server-action';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { emitirClaseCancelada } from '@/lib/notifications/emit';

/**
 * Server Action: Avisar a socias que su clase se ha cancelado (in-app/push).
 */
export async function avisarClaseCanceladaAction(sesionId: string) {
  const staff = await requireAuthInServerAction();
  const admin = getSupabaseAdmin();
  if (!admin) return { ok: true, skipped: true };

  if (!sesionId) {
    throw new Error('Falta sesionId');
  }

  // La sesión debe ser de su estudio
  const { data: ses } = await admin.from('sesiones')
    .select('id').eq('id', sesionId).eq('studio_id', staff.studioId).maybeSingle();
  if (!ses) {
    throw new Error('Sesión no encontrada');
  }

  await emitirClaseCancelada(admin, { studioId: staff.studioId, sesionId });
  return { ok: true };
}
