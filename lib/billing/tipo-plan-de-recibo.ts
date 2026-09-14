// ─────────────────────────────────────────────────────────────────────────────
// ¿De qué tipo de plan es este recibo? (para decidir si se le puede ofrecer
// Bizum, que en una cuota rompe la renovación — ver `bizum-permitido.ts`).
//
// La pregunta no la contesta una sola columna: `entrega_tipo` se escribe
// DESPUÉS de cobrar, así que un recibo pendiente casi siempre llega con NULL, y
// hay que mirar el plan de su suscripción. `tipoDeReciboParaBizum` decide cuál
// de los dos caminos toca; esto es la mitad que necesita base de datos, y vive
// aquí —y no dentro de cada ruta— porque el 14-sep el checkout online lo hacía
// y el mostrador no: la clase de fallo dominante de este repo es el gemelo
// divergente. Un solo sitio, dos llamantes.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import { tipoDeReciboParaBizum } from '@/lib/billing/bizum-permitido';

/**
 * Devuelve `'MENSUAL' | 'SIN_PLAN' | <tipo del plan> | null`.
 *
 * `null` significa «no se ha podido saber», y `bizumPermitidoPara(null)` es
 * `false`: ante la duda, sin Bizum. La tarjeta siempre sirve.
 */
export async function tipoDePlanDelRecibo(
  admin: SupabaseClient,
  recibo: { entrega_tipo?: string | null; suscripcion_id?: string | null },
): Promise<string | null> {
  const veredicto = tipoDeReciboParaBizum(recibo.entrega_tipo ?? null, recibo.suscripcion_id ?? null);
  if (veredicto !== 'CONSULTAR_PLAN') return veredicto;

  const { data: sus } = await admin
    .from('suscripciones').select('plan_id').eq('id', recibo.suscripcion_id).maybeSingle();
  if (!sus?.plan_id) return null;
  const { data: plan } = await admin
    .from('planes_tarifa').select('tipo').eq('id', sus.plan_id).maybeSingle();
  return (plan?.tipo as string | null | undefined) ?? null;
}
