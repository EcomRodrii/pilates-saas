// ¿El plan del estudio incluye el Centro de Control? La mitad pura de
// `bloqueoPorPlan` (plan-servidor.ts), la puerta que comprueban TODAS las rutas
// de /api/decisiones justo después del rol. Aprobar, rechazar, posponer y
// preguntar por el estado no la comprobaban: un estudio sin el plan (o con la
// prueba vencida) que conservara una recomendación PENDIENTE podía seguir
// aprobando cobros con su sesión, aunque la pantalla ya no se le enseñara.
//
// Pura (sin red ni imports de servidor): corre con `node --test`.
import { tieneFeature } from '../billing/entitlements.ts';

export const SIN_PLAN_DECISIONES = 'Tu plan no incluye el Centro de Control';
export const PLAN_SIN_COMPROBAR = 'No se ha podido comprobar tu plan. Vuelve a intentarlo.';

/**
 * Lo que responde la ruta según la fila del estudio: `null` si puede seguir.
 * Un fallo de la base de datos es un 500 —«vuelve a intentarlo»—, no un «tu
 * plan no lo incluye» que no es verdad; y sin fila, como sin plan: cerrado.
 */
export function bloqueoDelPlan(
  fila: { plan?: string | null; subscription_status?: string | null } | null,
  fallo: boolean,
): { status: 403 | 500; error: string } | null {
  if (fallo) return { status: 500, error: PLAN_SIN_COMPROBAR };
  if (!fila || !tieneFeature({ plan: fila.plan, subscriptionStatus: fila.subscription_status }, 'decisiones')) {
    return { status: 403, error: SIN_PLAN_DECISIONES };
  }
  return null;
}
