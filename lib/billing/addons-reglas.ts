// ¿Puede este estudio activar o quitar un complemento ahora? Puro (lo prueba
// `node --test`); lo aplica `app/api/billing/addons/route.ts`.
import { pagaAddonsAparte, type EstudioConPlan } from './entitlements.ts';

export type MotivoNoAddon = 'cadena' | 'sin-suscripcion' | 'no-hace-falta' | 'impago';

export const MENSAJE_NO_ADDON: Record<MotivoNoAddon, string> = {
  cadena: 'Tu sede va con el plan Cadena, que ya lo incluye todo.',
  'sin-suscripcion': 'Primero elige tu plan: los complementos se suman a Founding Studio.',
  'no-hace-falta': 'Tu plan ya lo incluye: no tienes que pagarlo aparte.',
  impago: 'Tu último cobro no ha salido. Cuando esté al día podrás activar complementos.',
};

export function motivoNoAddon(
  studio: EstudioConPlan & { cadenaId?: string | null; subscriptionId?: string | null },
  activar: boolean,
): MotivoNoAddon | null {
  if (studio.cadenaId) return 'cadena';
  if (!studio.subscriptionId) return 'sin-suscripcion';
  // Quitar siempre se puede (también con un cobro pendiente): no se cobra de más.
  if (!activar) return null;
  if (studio.subscriptionStatus === 'past_due') return 'impago';
  if (studio.subscriptionStatus !== 'active' && studio.subscriptionStatus !== 'trialing') return 'sin-suscripcion';
  if (!pagaAddonsAparte(studio)) return 'no-hace-falta';
  return null;
}
