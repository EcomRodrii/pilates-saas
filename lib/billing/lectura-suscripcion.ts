// Qué dice una suscripción de Stripe del plan y de los complementos de un
// estudio (19-oct-2026). Pura: la usan el webhook y la ruta que activa o quita
// un complemento, y la prueba `node --test`.
//
// ⚠️ Desde los complementos, una suscripción tiene VARIAS líneas: el plan y un
// complemento por línea. El webhook leía `items[0]` como el plan; con el orden
// de Stripe no garantizado, una línea de complemento en primera posición habría
// dejado el plan sin leer. Aquí el plan es la línea cuyo precio es de un plan.
import type { Addon, Plan } from './entitlements.ts';

export interface LineaSuscripcion { priceId: string | null | undefined }

/** Estados en los que las líneas ya no dan nada (la suscripción se acabó). */
const TERMINADA = new Set(['canceled', 'incomplete_expired']);

export function lecturaSuscripcion(
  lineas: readonly LineaSuscripcion[],
  estado: string | null | undefined,
  mapa: { plan: (priceId: string | null | undefined) => Plan | null; addon: (priceId: string | null | undefined) => Addon | null },
): { plan: Plan | null; addons: Addon[] } {
  let plan: Plan | null = null;
  const addons: Addon[] = [];
  for (const l of lineas) {
    plan ??= mapa.plan(l.priceId);
    const a = mapa.addon(l.priceId);
    if (a && !addons.includes(a)) addons.push(a);
  }
  return { plan, addons: estado && TERMINADA.has(estado) ? [] : addons };
}

/** La metadata que pone el checkout desde el 19-oct-2026: régimen de complementos. */
export const METADATA_REGIMEN = { regimen: 'addons' } as const;

export function esRegimenAddons(metadata: Record<string, string> | null | undefined): boolean {
  return metadata?.regimen === METADATA_REGIMEN.regimen;
}
