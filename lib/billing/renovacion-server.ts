import type { SupabaseClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';

// Aplica la RENOVACIÓN de una suscripción cuando se cobra su recibo, en el
// SERVIDOR. Espejo de aplicarRenovacionSuscripcion del cliente
// (studio-context): esa versión solo corre cuando alguien pulsa "marcar
// cobrado" en el panel — los cobros del barrido de dunning y de los webhooks de
// Stripe marcaban el recibo COBRADO pero dejaban el bono a 0 sesiones y el
// mensual caducado: dinero cobrado sin renovar nada.
//
// Idempotente: el refill de bono solo aplica con sesiones_restantes = 0, y la
// extensión mensual solo si alarga la fecha_fin actual — un webhook duplicado
// no extiende dos veces.
export async function aplicarRenovacionServidor(
  admin: SupabaseClient,
  params: { studioId: string; reciboId: string },
): Promise<void> {
  const { studioId, reciboId } = params;
  try {
    const { data: rec } = await admin
      .from('recibos')
      .select('suscripcion_id')
      .eq('id', reciboId)
      .eq('studio_id', studioId)
      .maybeSingle();
    if (!rec?.suscripcion_id) return;

    const { data: sus } = await admin
      .from('suscripciones')
      .select('id, plan_id, sesiones_restantes, fecha_fin')
      .eq('id', rec.suscripcion_id)
      .eq('studio_id', studioId)
      .maybeSingle();
    if (!sus) return;

    const { data: plan } = await admin
      .from('planes_tarifa')
      .select('tipo, sesiones')
      .eq('id', sus.plan_id)
      .eq('studio_id', studioId)
      .maybeSingle();
    if (!plan) return;

    if ((plan.tipo === 'BONO' || plan.tipo === 'PUNTUAL') && sus.sesiones_restantes === 0) {
      await admin
        .from('suscripciones')
        .update({ sesiones_restantes: plan.sesiones, estado: 'ACTIVA' })
        .eq('id', sus.id)
        .eq('studio_id', studioId);
    } else if (plan.tipo === 'MENSUAL') {
      const nuevaFin = new Date();
      nuevaFin.setMonth(nuevaFin.getMonth() + 1);
      const fechaFin = nuevaFin.toISOString().slice(0, 10);
      if (!sus.fecha_fin || sus.fecha_fin < fechaFin) {
        await admin
          .from('suscripciones')
          .update({ fecha_fin: fechaFin, estado: 'ACTIVA' })
          .eq('id', sus.id)
          .eq('studio_id', studioId);
      }
    }
  } catch (e) {
    // La renovación es post-cobro: un fallo aquí no debe deshacer ni bloquear
    // el cobro ya hecho, pero tampoco puede ser invisible (bono cobrado y no
    // recargado = clase sin poder reservar).
    Sentry.captureException(e instanceof Error ? e : new Error('Fallo al aplicar renovación'), {
      level: 'error', tags: { area: 'cobros', tipo: 'renovacion' }, extra: { reciboId, studioId },
    });
  }
}
