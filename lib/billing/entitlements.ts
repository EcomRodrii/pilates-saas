// ─────────────────────────────────────────────────────────────────────────────
// Entitlements: qué puede hacer un estudio según su PLAN de suscripción del SaaS.
// Fuente de verdad única, sin React ni Supabase (testeable).
//
// Modelo de negocio: prueba gratuita de TRIAL_DIAS días (con tarjeta, vía Stripe
// Checkout) en la PRIMERA suscripción del estudio; después se cobra. Un estudio
// sin suscripción activa NI en prueba no tiene acceso al producto (accesoProducto()).
// ─────────────────────────────────────────────────────────────────────────────

export type Plan = 'BASE' | 'ESTUDIO' | 'CADENA';

/** Días de prueba gratuita de la primera suscripción del estudio al SaaS. */
export const TRIAL_DIAS = 14;

export interface Entitlements {
  /** Tope de socias activas. Infinity = ilimitado. */
  maxSocios: number;
  features: {
    gamificacion: boolean; // créditos, logros, retos, niveles, rachas
    marketing: boolean;    // campañas, automatizaciones de marketing
    ia: boolean;           // asistente de campañas, notas de instructor con IA
    multiCentro: boolean;  // cadena con varios centros
    decisiones: boolean;   // Decision OS / Centro de Control — gate de plan; el
                            // encendido operativo real por estudio vive en
                            // decision_feature_flags (DECISION-OS-MODELO-DATOS.md §2.11)
    marca: boolean;        // app de marca: tema white-label del portal (editor + publicar)
    sustitucionesAutonomas: boolean; // modos autónomo/vacaciones del motor de
                                     // sustituciones (Base se queda en manual/asistido)
  };
}

export const PLAN_ENTITLEMENTS: Record<Plan, Entitlements> = {
  BASE: {
    maxSocios: 150,
    features: { gamificacion: false, marketing: false, ia: false, multiCentro: false, decisiones: false, marca: false, sustitucionesAutonomas: false },
  },
  ESTUDIO: {
    maxSocios: Infinity,
    features: { gamificacion: true, marketing: true, ia: true, multiCentro: false, decisiones: true, marca: true, sustitucionesAutonomas: true },
  },
  CADENA: {
    maxSocios: Infinity,
    features: { gamificacion: true, marketing: true, ia: true, multiCentro: true, decisiones: true, marca: true, sustitucionesAutonomas: true },
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

/** ¿Este estudio puede usar el producto? En prueba (trialing) o con suscripción activa. */
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

/**
 * El plan más barato que ya incluye esta feature, para poder decir "Disponible
 * en el plan Estudio" en un bloqueo suave de UI. `null` si ningún plan la
 * incluye (no debería pasar con las features actuales, pero deja la puerta
 * abierta sin reventar en runtime).
 */
export function planMinimoPara(feature: keyof Entitlements['features']): Plan | null {
  return PLANES.find((p) => PLAN_ENTITLEMENTS[p].features[feature]) ?? null;
}
