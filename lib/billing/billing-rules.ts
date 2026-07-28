// ─────────────────────────────────────────────────────────────────────────────
// R7 · Reglas de enforcement de plan/suscripción — LÓGICA PURA (sin next/server,
// testeable con `node --test`). El envoltorio HTTP (NextResponse) vive en
// lib/billing/billing-guard.ts, que es lo que importan las rutas.
//
// FILOSOFÍA: todo detrás de `BILLING_ENFORCED`. Con la env sin poner (estado
// actual de prod, sin planes asignados) las reglas FALLAN ABIERTO — no bloquean
// a nadie. Se encienden con BILLING_ENFORCED=true en Vercel cuando el billing
// está vivo. Ver también lib/billing/stripe-fees.ts (mismo patrón "mecanismo apagado").
// ─────────────────────────────────────────────────────────────────────────────

import { getSupabaseAdmin } from '../db/supabase-admin.ts';
import { accesoProducto, tieneFeature, entitlementsDe, type Entitlements } from './entitlements.ts';

/** Motivo de denegación (sin acoplar a HTTP: el status es orientativo del código). */
export type Denegacion = {
  status: number;
  error: string;
  code: 'SUSCRIPCION_INACTIVA' | 'PLAN_SIN_FEATURE' | 'LIMITE_SOCIAS' | 'ESTUDIO_SUSPENDIDO';
  feature?: keyof Entitlements['features'];
  max?: number | null;
};

export function billingEnforced(): boolean {
  return process.env.BILLING_ENFORCED === 'true';
}

type StudioBilling = { plan: string | null; subscriptionStatus: string | null };

async function cargarBilling(studioId: string): Promise<StudioBilling | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null; // sin service-role no podemos comprobar → fail-open
  const { data } = await admin
    .from('studios')
    .select('plan, subscription_status')
    .eq('id', studioId)
    .single();
  if (!data) return null;
  return { plan: data.plan, subscriptionStatus: data.subscription_status };
}

/**
 * Denegación si el equipo de Tentare ha suspendido el estudio a mano.
 *
 * A propósito NO mira `billingEnforced()`: suspender es una decisión explícita
 * (impago persistente, abuso, petición del cliente), no una inferencia de
 * billing. Si el cobro forzoso está apagado, la suspensión sigue valiendo —
 * lo contrario haría que apagar una env levantara todos los cortes.
 *
 * Sí falla abierto sin service-role, igual que el resto: preferimos dejar pasar
 * a alguien suspendido que tumbar el producto entero por un fallo de infra.
 */
export async function evaluarSuspension(studioId: string): Promise<Denegacion | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const { data } = await admin
    .from('studios')
    .select('suspendido_en, suspendido_motivo')
    .eq('id', studioId)
    .maybeSingle();
  if (!data?.suspendido_en) return null;
  const motivo = (data.suspendido_motivo as string | null)?.trim();
  return {
    status: 403,
    // El motivo se le enseña al cliente: por eso el panel lo exige por escrito.
    error: motivo
      ? `Tu cuenta está suspendida: ${motivo}. Escríbenos a soporte@tentare.app.`
      : 'Tu cuenta está suspendida. Escríbenos a soporte@tentare.app.',
    code: 'ESTUDIO_SUSPENDIDO',
  };
}

/** Denegación si la suscripción del estudio no está activa. `null` = puede seguir. */
export async function evaluarSuscripcion(studioId: string): Promise<Denegacion | null> {
  // La suspensión manda sobre cualquier consideración de billing y se comprueba
  // primero: un estudio suspendido no opera aunque tenga la suscripción al día.
  const suspendido = await evaluarSuspension(studioId);
  if (suspendido) return suspendido;

  if (!billingEnforced()) return null;
  const billing = await cargarBilling(studioId);
  if (!billing) return null;
  if (accesoProducto({ subscriptionStatus: billing.subscriptionStatus })) return null;
  return {
    status: 402,
    error: 'Tu suscripción no está activa. Reactívala en Suscripción para seguir operando.',
    code: 'SUSCRIPCION_INACTIVA',
  };
}

/** Denegación si el plan del estudio no incluye la feature. `null` = puede seguir. */
export async function evaluarFeature(
  studioId: string,
  feature: keyof Entitlements['features'],
): Promise<Denegacion | null> {
  if (!billingEnforced()) return null;
  const billing = await cargarBilling(studioId);
  if (!billing) return null;
  if (tieneFeature({ plan: billing.plan, subscriptionStatus: billing.subscriptionStatus }, feature)) return null;
  return {
    status: 403,
    error: 'Tu plan no incluye esta función. Mejóralo en Suscripción.',
    code: 'PLAN_SIN_FEATURE',
    feature,
  };
}

/** Denegación si añadir `aAnadir` socias superaría el tope del plan. `null` = puede seguir. */
export async function evaluarLimiteSocias(
  studioId: string,
  sociasActuales: number,
  aAnadir: number,
): Promise<Denegacion | null> {
  if (!billingEnforced()) return null;
  const billing = await cargarBilling(studioId);
  if (!billing) return null;
  const max = entitlementsDe({ plan: billing.plan }).maxSocios;
  if (sociasActuales + aAnadir <= max) return null;
  return {
    status: 403,
    error: `Tu plan permite hasta ${max === Infinity ? 'ilimitadas' : max} socias activas. Mejóralo para añadir más.`,
    code: 'LIMITE_SOCIAS',
    max: max === Infinity ? null : max,
  };
}
