// ─────────────────────────────────────────────────────────────────────────────
// Entitlements: qué puede hacer un estudio según su PLAN de suscripción del SaaS.
// Fuente de verdad única, sin React ni Supabase (testeable).
//
// Modelo de negocio (Fase 2): sin trial — se cobra desde el día 1. Un estudio
// sin suscripción ACTIVA no tiene acceso al producto (ver accesoProducto()).
// ─────────────────────────────────────────────────────────────────────────────

export type Plan = 'BASE' | 'ESTUDIO' | 'CADENA';

export interface Entitlements {
  /** Tope de socias activas. Infinity = ilimitado. */
  maxSocios: number;
  features: {
    gamificacion: boolean; // créditos, logros, retos, niveles, rachas
    marketing: boolean;    // campañas, automatizaciones de marketing
    ia: boolean;           // asistente de campañas, notas de instructor con IA
    multiCentro: boolean;  // cadena con varios centros
  };
}

export const PLAN_ENTITLEMENTS: Record<Plan, Entitlements> = {
  BASE: {
    maxSocios: 150,
    features: { gamificacion: false, marketing: false, ia: false, multiCentro: false },
  },
  ESTUDIO: {
    maxSocios: Infinity,
    features: { gamificacion: true, marketing: true, ia: true, multiCentro: false },
  },
  CADENA: {
    maxSocios: Infinity,
    features: { gamificacion: true, marketing: true, ia: true, multiCentro: true },
  },
};

/** Info de cada plan para la UI de precios (los price IDs de Stripe van aparte). */
export const PLAN_INFO: Record<Plan, { nombre: string; precioMes: number; resumen: string }> = {
  BASE: { nombre: 'Base', precioMes: 29, resumen: 'Reservas, cobros y check-in. Hasta 150 socias.' },
  ESTUDIO: { nombre: 'Estudio', precioMes: 59, resumen: 'Socias ilimitadas + gamificación, marketing e IA.' },
  CADENA: { nombre: 'Cadena', precioMes: 149, resumen: 'Multi-centro y todo incluido.' },
};

export const PLANES: Plan[] = ['BASE', 'ESTUDIO', 'CADENA'];

/** Estados de suscripción de Stripe que dan acceso al producto. */
export function suscripcionActiva(status: string | null | undefined): boolean {
  // 'past_due': Stripe reintenta el cobro; damos periodo de gracia corto para no
  // cortar el servicio por un fallo puntual de tarjeta.
  return status === 'active' || status === 'trialing' || status === 'past_due';
}

/** ¿Este estudio puede usar el producto? Sin trial: solo con suscripción activa. */
export function accesoProducto(studio: { subscriptionStatus?: string | null }): boolean {
  return suscripcionActiva(studio.subscriptionStatus);
}

function planDe(studio: { plan?: string | null }): Plan {
  const p = studio.plan;
  return p === 'ESTUDIO' || p === 'CADENA' ? p : 'BASE';
}

/** Entitlements efectivos del estudio (según su plan). */
export function entitlementsDe(studio: { plan?: string | null }): Entitlements {
  return PLAN_ENTITLEMENTS[planDe(studio)];
}

/** ¿El estudio tiene acceso a una feature concreta (y suscripción activa)? */
export function tieneFeature(
  studio: { plan?: string | null; subscriptionStatus?: string | null },
  feature: keyof Entitlements['features'],
): boolean {
  return accesoProducto(studio) && entitlementsDe(studio).features[feature];
}

/** ¿Puede añadir una socia más sin superar el tope de su plan? */
export function puedeAnadirSocia(
  studio: { plan?: string | null },
  sociasActuales: number,
): boolean {
  return sociasActuales < entitlementsDe(studio).maxSocios;
}
