// ¿Puede un estudio vender AHORA por las plataformas conectadas por API (Urban
// Sports Club, Wellhub)?
//
// Un estudio sin contrato —baja de pago o prueba gratuita vencida— o suspendido
// a mano no vende fuera: se trata igual que si hubiera apagado la integración
// (decisión del fundador, 7-oct-2026). Los crons retiran lo publicado por el
// camino de apagar (Wellhub respeta lo ya vendido; USC cancela sus eventos) y
// los webhooks rechazan la reserva nueva. Motivo: quien deja de pagar casi
// siempre se va a otro programa que publicará en esas mismas plataformas, y
// Tentare publica con SUS credenciales de integrador.
//
// «Sin contrato» es la MISMA definición que el ciclo de baja y purga
// (`cicloDelEstudio`), más la prueba local que ya venció y el barrido de pg_cron
// (`cerrar_pruebas_vencidas`, cada 15 min) aún no ha cerrado: regla de negocio,
// no de reloj. Se decide en cada petición con la fila del estudio, sin esperar
// a que ningún cron apague nada.
//
// Lo que NO corta: `past_due`/`unpaid` (la suscripción sigue viva), el modo
// manual (recepción apunta una venta que ya ocurrió: bloquearla no evita que la
// persona venga) ni lo que llega de una reserva ya hecha (cancelaciones,
// check-ins: sin validar el check-in, Wellhub no paga la visita).
//
// ⚠️ Módulo LIGERO: lo importan los webhooks, que tienen menos de un segundo.
import type { SupabaseClient } from '@supabase/supabase-js';
import { cicloDelEstudio, type MotivoCiclo } from '../retencion/ciclo-estudios-vencidos.ts';
import { estadoTrial } from '../billing/trial.ts';

export type MotivoSinVentaExterna = MotivoCiclo | 'suspendido';

/** Las columnas de `studios` que lo deciden. */
export const COLUMNAS_VENTA_EXTERNA = 'subscription_status, subscription_id, trial_ends_at, contrato_terminado_en, suspendido_en';

export interface FilaVentaExterna {
  subscription_status: string | null;
  subscription_id: string | null;
  trial_ends_at: string | null;
  contrato_terminado_en: string | null;
  suspendido_en: string | null;
}

/** Por qué este estudio no vende fuera ahora mismo; `null` si puede. */
export function motivoSinVentaExterna(e: FilaVentaExterna, ahora: number = Date.now()): MotivoSinVentaExterna | null {
  if (e.suspendido_en) return 'suspendido';
  const ciclo = cicloDelEstudio({
    trialEndsAt: e.trial_ends_at, subscriptionStatus: e.subscription_status,
    subscriptionId: e.subscription_id, contratoTerminadoEn: e.contrato_terminado_en,
  });
  if (ciclo) return ciclo.motivo;
  // La prueba LOCAL ('trialing' sin suscripción de Stripe) vence a su hora,
  // como en el gate del panel; con `subscription_id`, la prueba la cierra Stripe.
  if (e.subscription_status === 'trialing' && !e.subscription_id) {
    const trial = estadoTrial({ trialEndsAt: e.trial_ends_at, subscriptionStatus: e.subscription_status, subscriptionId: null }, new Date(ahora));
    if (trial.agotada) return 'prueba_vencida';
  }
  return null;
}

/** Lo que se le dice a la propietaria en Conexiones: «Sin publicar · …». */
export function porQueSinVentaExterna(motivo: MotivoSinVentaExterna): string {
  switch (motivo) {
    case 'suspendido': return 'tu cuenta está suspendida';
    case 'baja': return 'tu suscripción ha terminado';
    case 'prueba_vencida': return 'tu prueba gratuita ha terminado';
  }
}

type Lector = Pick<SupabaseClient, 'from'>;

/**
 * Para un webhook: el motivo de un estudio, `null` si vende, o `'error'` si no
 * se ha podido leer (quien llama contesta como a cualquier fallo de la base de
 * datos: nunca se acepta una reserva a ciegas).
 */
export async function motivoSinVentaExternaDe(
  admin: Lector, studioId: string, ahora: number = Date.now(),
): Promise<MotivoSinVentaExterna | null | 'error'> {
  const { data, error } = await admin.from('studios').select(COLUMNAS_VENTA_EXTERNA).eq('id', studioId).maybeSingle();
  if (error || !data) return 'error';
  return motivoSinVentaExterna(data as unknown as FilaVentaExterna, ahora);
}

/**
 * Para un cron: los estudios de `ids` que hoy no venden fuera. Si la lectura
 * falla, se lanza: un cron no decide a ciegas qué retirar.
 */
export async function estudiosSinVentaExterna(
  admin: Lector, ids: Iterable<string>, ahora: number = Date.now(),
): Promise<Map<string, MotivoSinVentaExterna>> {
  const unicos = [...new Set(ids)];
  const sinVenta = new Map<string, MotivoSinVentaExterna>();
  for (let i = 0; i < unicos.length; i += 200) {
    const { data, error } = await admin.from('studios')
      .select(`id, ${COLUMNAS_VENTA_EXTERNA}`).in('id', unicos.slice(i, i + 200));
    if (error) throw new Error(`leyendo el contrato de los estudios: ${error.message}`);
    for (const fila of (data ?? []) as unknown as (FilaVentaExterna & { id: string })[]) {
      const motivo = motivoSinVentaExterna(fila, ahora);
      if (motivo) sinVenta.set(fila.id, motivo);
    }
  }
  return sinVenta;
}
