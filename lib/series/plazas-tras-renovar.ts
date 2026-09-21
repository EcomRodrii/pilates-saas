import type { SupabaseClient } from '@supabase/supabase-js';
import { HORIZONTE_MATERIALIZAR_DIAS } from '../plazas-fijas-slot.ts';

// Tras renovar una serie, las plazas fijas del hueco no se copian: se anclan por
// día, hora y sala, y la clase renovada es la misma. Solo se pasa el motor por
// ellas para que queden reservadas ya y no a las 2:00. Mejor esfuerzo: si falla,
// el cron de esta noche las recoge. Lo comparten la ruta del panel y el barrido
// de renovación automática.
export async function reservarPlazasFijasRenovadas(admin: SupabaseClient, respuestaRpc: unknown): Promise<void> {
  const ids = (respuestaRpc as { plazas_fijas_ids?: unknown } | null)?.plazas_fijas_ids;
  if (!Array.isArray(ids)) return;
  for (const plazaId of ids) {
    if (typeof plazaId !== 'string') continue;
    const { error } = await admin.rpc('materializar_plazas_fijas', { p_horizonte_dias: HORIZONTE_MATERIALIZAR_DIAS, p_plaza_id: plazaId });
    if (error) console.error('[series] materializar plaza fija tras renovar', error.message);
  }
}
