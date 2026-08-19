// ─────────────────────────────────────────────────────────────────────────────
// Entitlements: qué puede hacer un estudio según su PLAN de suscripción del SaaS.
// Fuente de verdad única, sin React ni Supabase (testeable).
//
// Modelo de negocio: prueba gratuita de TRIAL_DIAS días SIN TARJETA, que arranca
// al crear el estudio (no en Stripe — ver lib/billing/trial.ts); después se
// elige plan y se cobra. Un estudio sin suscripción activa NI en prueba no tiene
// acceso al producto (accesoProducto()).
// ─────────────────────────────────────────────────────────────────────────────

import { TRIAL_DIAS } from './trial.ts';

export type Plan = 'BASE' | 'ESTUDIO' | 'CADENA';

// Re-exportado para no partir en dos el sitio desde el que se importa: la
// definición vive junto al resto de la lógica de la prueba, pero quien ya
// pedía `TRIAL_DIAS` a este módulo lo sigue teniendo aquí.
export { TRIAL_DIAS };

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

/**
 * Estados de suscripción que dan acceso al producto.
 *
 * ⚠️ 'trialing' cubre DOS cosas desde que la prueba es local y sin tarjeta: la
 * prueba de Stripe (la cierra Stripe) y la nuestra (no la cierra nadie solo).
 * Aquí las dos pasan a propósito — quien tiene que distinguirlas es
 * `estadoTrial()` (lib/billing/trial.ts), que compara contra `trial_ends_at`.
 * Esta función no puede hacerlo: recibe un string, no el estudio.
 *
 * Por eso el gate de verdad (`/api/billing/status`) deriva el vencimiento en
 * vivo en cada petición, y el barrido `cerrar_pruebas_vencidas()` deja la
 * columna en 'trial_expirado' —que NO está en esta lista— para que el resto de
 * consumidores vean la verdad sin tener que derivar nada.
 */
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
