// Lo que el cron de renovaciones HACE con las decisiones de alineación que no crean
// un recibo nuevo (reparar una entrega, extender sin recibo, saltar). Va aparte de
// `lib/inngest/renovaciones.ts` para poder probarlo con `node --test` (el cron
// importa con alias `@/`). Cobrar y `normal` los crea el propio cron, que es quien
// ya sabe insertar el recibo: aquí devuelven 'seguir'.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DecisionRenovacion } from './alineacion-dia1.ts';

export type ResultadoDecision = 'seguir' | 'saltada' | 'reparada' | 'extendida' | 'sin_cambio';

export interface DependenciasDecision {
  aplicarRenovacion: (admin: SupabaseClient, p: { studioId: string; reciboId: string }) => Promise<{ aplicada: boolean }>;
}

export async function ejecutarDecisionAlineacion(
  admin: SupabaseClient,
  e: { studioId: string; suscripcionId: string; fechaFin: string | null; decision: DecisionRenovacion },
  deps: DependenciasDecision,
): Promise<ResultadoDecision> {
  const { decision, studioId } = e;
  if (decision.accion === 'saltar') return 'saltada';
  if (decision.accion === 'reparar') {
    // Cobrado y con la entrega registrada como FALLIDA (`entrega_aplicada = false`): el snapshot del
    // recibo cortaría la repetición, así que se limpia antes (solo si sigue en false) y se repite la
    // entrega, que es idempotente por el guard `fecha_fin >= nueva`. Nunca se cobra ni se crea recibo.
    const { error } = await admin.from('recibos')
      .update({ entrega_tipo: null, entrega_aplicada: null })
      .eq('id', decision.reciboId).eq('studio_id', studioId).eq('entrega_aplicada', false);
    if (error) throw new Error(error.message);
    const r = await deps.aplicarRenovacion(admin, { studioId, reciboId: decision.reciboId });
    if (!r.aplicada) console.error('[renovaciones] alineación: la entrega sigue sin aplicarse', { studioId, reciboId: decision.reciboId });
    return 'reparada';
  }
  if (decision.accion === 'extender') {
    // ≤N días de mes: cortesía hasta fin de mes SIN recibo; el día 1 el cron cobra la entera.
    // Condicional a que nada cambiase desde la lectura: repetirlo no hace nada.
    const { data, error } = await admin.from('suscripciones')
      .update({ fecha_fin: decision.plan.fechaFinNueva })
      .eq('id', e.suscripcionId).eq('studio_id', studioId)
      .eq('estado', 'ACTIVA').eq('fecha_fin', e.fechaFin as string)
      .not('baja_al_vencer', 'is', true)
      .select('id');
    if (error) throw new Error(error.message);
    if ((data ?? []).length > 0) {
      console.info('[renovaciones] alineación día 1: cortesía hasta fin de mes', { studioId, suscripcionId: e.suscripcionId, hasta: decision.plan.fechaFinNueva });
      return 'extendida';
    }
    return 'sin_cambio';
  }
  return 'seguir';
}
