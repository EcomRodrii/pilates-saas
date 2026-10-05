// Una cuenta del equipo de Tentare (`plataforma_admin` activa) no puede quitarse
// la verificación en dos pasos: `/interno` exige `aal2` siempre (lib/interno/mfa.ts)
// y, si no hay factor, obliga a darlo de alta. El factor es UNO por cuenta, así
// que «Desactivar» en el panel o en la app del estudio solo duraba hasta la
// siguiente visita a `/interno`, que lo volvía a crear y con él volvía a pedirse
// el código en todas partes (5-oct-2026: «me lo pide aunque lo haya quitado»).
// Por eso esas pantallas no ofrecen quitarla a quien es del equipo de Tentare.
import 'server-only';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';

/** Si no se puede leer, `false`: la pantalla se queda como para cualquier otra cuenta. */
export async function esCuentaDeTentare(userId: string): Promise<boolean> {
  const admin = getSupabaseAdmin();
  if (!admin) return false;
  const { data, error } = await admin
    .from('plataforma_admin').select('activo').eq('auth_user_id', userId).maybeSingle();
  if (error) return false;
  return data?.activo === true;
}
