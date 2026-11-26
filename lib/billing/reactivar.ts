// La pantalla a la que llega un estudio al que se le ha acabado el plazo:
// /studio/<id>/access_account/reactivate (26-nov-2026). Aquí solo la dirección y
// la decisión de qué hacer al llegar; pura, para poder probarla.
import type { Plan } from './entitlements.ts';

export const rutaReactivar = (estudioId: string) => `/studio/${encodeURIComponent(estudioId)}/access_account/reactivate`;

/** Donde está todo lo que esta pantalla no hace: elegir plan, pago anual, Cadena, descargar datos. */
export const RUTA_TODOS_LOS_PLANES = '/suscripcion#tu-plan';

/** Lo que hace falta del estado de la suscripción (/api/billing/status). */
export interface EstadoParaReactivar {
  estudioId?: string;
  esPropietaria: boolean;
  bloqueado: boolean;
  plan: string;
  gratis?: unknown;
  opcionesDePlan?: { soloCadena: boolean } | null;
}

export type DecisionReactivar =
  | { accion: 'pagar'; plan: Extract<Plan, 'BASE' | 'ESTUDIO'> }
  | { accion: 'ir'; a: string };

/**
 * `estudioDeLaUrl` solo sirve para corregir la dirección: los datos y el cobro
 * salen siempre del estudio de la SESIÓN, nunca del que diga la URL.
 */
export function decidirReactivacion(estado: EstadoParaReactivar | null, estudioDeLaUrl: string | null): DecisionReactivar {
  // Sin estado (red caída, sesión sin verificar) manda el panel, que ya sabe qué hacer.
  if (!estado) return { accion: 'ir', a: '/dashboard' };
  if (!estado.bloqueado) return { accion: 'ir', a: '/dashboard' };
  if (!estado.esPropietaria || !estado.estudioId) return { accion: 'ir', a: RUTA_TODOS_LOS_PLANES };
  if (estudioDeLaUrl !== null && estudioDeLaUrl !== estado.estudioId) return { accion: 'ir', a: rutaReactivar(estado.estudioId) };
  // Una sede secundaria solo puede contratar Cadena, y Cadena avisa antes de lo que cancela.
  if (estado.opcionesDePlan?.soloCadena) return { accion: 'ir', a: RUTA_TODOS_LOS_PLANES };
  // Quien viene del plan gratis pasa a Founding Studio de pago (fundador, 15-oct-2026).
  const plan = estado.gratis ? 'BASE' : estado.plan;
  if (plan !== 'BASE' && plan !== 'ESTUDIO') return { accion: 'ir', a: RUTA_TODOS_LOS_PLANES };
  return { accion: 'pagar', plan };
}
