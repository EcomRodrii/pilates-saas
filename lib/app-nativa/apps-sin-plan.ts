// La app de un estudio que deja de pagar Estudio/Cadena, o baja a Founding (decisión del fundador,
// 15-oct-2026): sigue funcionando 30 días con aviso a la propietaria; si para entonces no ha vuelto,
// se pausa y se retira de la App Store. Quien ya la tenga instalada la sigue usando (es la web de su
// estudio); lo que se acaba es descargarla y recibir versiones nuevas.
//
// Lógica pura (imports relativos con extensión: la ejecuta `node --test`). La aplica el cron horario
// `notif-trial` (`revisarAppsSinPlan`, apps-sin-plan-cron.ts).

import { entitlementsDe } from '../billing/entitlements.ts';
import type { EstadoApp } from './pedir-app.ts';

export const DIAS_MARGEN_SIN_PLAN = 30;
const DIA_MS = 24 * 60 * 60 * 1000;

/** ¿Tiene el dueño de la app lo que la incluye, pagado? (El mismo criterio que para pedirla.) */
export function pagaLaApp(estudio: { plan: string | null; estado: string | null }): boolean {
  return entitlementsDe({ plan: estudio.plan }).features.appPropia && estudio.estado === 'active';
}

export type AccionSinPlan =
  | { tipo: 'nada' }
  /** Acaba de dejar de pagarla: empieza el margen (y se avisa). */
  | { tipo: 'empieza'; hasta: Date }
  /** Vuelve a pagarla: se borra el margen. Si ya estaba pausada, sigue pausada (se retoma a mano). */
  | { tipo: 'vuelve' }
  /** Se acabó el margen: se pausa (y se avisa). */
  | { tipo: 'retirar' };

export function accionSinPlan(
  app: { estado: EstadoApp; sinPlanDesde: string | null },
  estudio: { plan: string | null; estado: string | null },
  ahora: Date,
): AccionSinPlan {
  const paga = pagaLaApp(estudio);
  if (paga) return app.sinPlanDesde ? { tipo: 'vuelve' } : { tipo: 'nada' };
  // Ya pausada: no hay nada más que retirar.
  if (app.estado === 'PAUSADA') return { tipo: 'nada' };
  if (!app.sinPlanDesde) return { tipo: 'empieza', hasta: finDelMargen(ahora) };
  const desde = new Date(app.sinPlanDesde);
  if (Number.isNaN(desde.getTime())) return { tipo: 'empieza', hasta: finDelMargen(ahora) };
  return ahora.getTime() >= finDelMargen(desde).getTime() ? { tipo: 'retirar' } : { tipo: 'nada' };
}

export const finDelMargen = (desde: Date): Date => new Date(desde.getTime() + DIAS_MARGEN_SIN_PLAN * DIA_MS);
