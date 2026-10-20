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
    marca: boolean;        // app de marca: tema white-label del portal (editor + publicar).
                           // En TODOS los planes desde el 2-oct-2026 (decisión del fundador):
                           // el plan de entrada pasó a llamarse Founding Studio y la incluye.
    sustitucionesAutonomas: boolean; // modos autónomo/vacaciones del motor de
                                     // sustituciones (Base se queda en manual/asistido)
    asistente: boolean;    // «Pregúntale a Tentare»: preguntas sobre el estudio con sus
                           // datos. En TODOS los planes (fundador, 5-oct-2026); lo que
                           // cambia es cuántas al mes (`consultasAsistenteMes`). Es una
                           // feature aparte de `ia` a propósito: Founding Studio lo tiene
                           // y sigue sin la IA de notas y campañas.
    appPropia: boolean;    // la app PROPIA del estudio en la tienda de apps, con su
                           // nombre y su icono (la que prepara «Pedir mi app»). Solo
                           // Estudio y Cadena: es lo que los distingue de Founding
                           // Studio (fundador, 15-oct-2026: «estudio incluye la app
                           // alumna»). ⚠️ No es `marca` (la app web instalable con los
                           // colores y el logo del estudio), que va en todos los planes.
  };
  /**
   * Consultas del asistente al mes (mes de Madrid). Espejo de
   * `ia_cuota_mensual()` (migr 20261005213749), que es la dueña del saldo:
   * esto solo sirve para los textos, y un test cruza los dos números.
   */
  consultasAsistenteMes: number;
}

/** Durante la prueba gratuita local, consultas del asistente en TOTAL (no por mes): decisión del 5-oct-2026. */
export const CONSULTAS_ASISTENTE_PRUEBA = 30;

export const PLAN_ENTITLEMENTS: Record<Plan, Entitlements> = {
  // Founding Studio (de pago, 29 €) para quien empieza a pagarlo desde el
  // 19-oct-2026: el núcleo, sin varias sedes ni la app propia, y sin tope de
  // alumnas. El Centro de Control, las sustituciones automáticas y la IA de
  // redacción van aparte, como complementos de pago (`ADDONS`, decisión del
  // fundador). ⚠️ Quien ya pagaba Founding antes conserva todo: eso lo decide
  // `entitlementsDe` con `regimenAddons` (BASE_COMPLETO), no esta tabla.
  BASE: {
    maxSocios: Infinity,
    features: { gamificacion: true, marketing: true, ia: false, multiCentro: false, decisiones: false, marca: true, sustitucionesAutonomas: false, asistente: true, appPropia: false },
    consultasAsistenteMes: 50,
  },
  ESTUDIO: {
    maxSocios: Infinity,
    features: { gamificacion: true, marketing: true, ia: true, multiCentro: false, decisiones: true, marca: true, sustitucionesAutonomas: true, asistente: true, appPropia: true },
    consultasAsistenteMes: 200,
  },
  CADENA: {
    maxSocios: Infinity,
    features: { gamificacion: true, marketing: true, ia: true, multiCentro: true, decisiones: true, marca: true, sustitucionesAutonomas: true, asistente: true, appPropia: true },
    consultasAsistenteMes: 500,
  },
};

/**
 * Info de cada plan para la UI de precios (los price IDs de Stripe van aparte).
 *
 * ⚠️ `nombre` es lo que se ENSEÑA; el id (`BASE`) es lo que se guarda en
 * `studios.plan` (CHECK `studios_plan_valido`) y lo que mapean los price IDs.
 * El plan de entrada se llama «Founding Studio» desde el 2-oct-2026 sin cambiar
 * su id: renombrarlo exigiría migrar la columna y los precios de Stripe.
 */
export const PLAN_INFO: Record<Plan, { nombre: string; precioMes: number; resumen: string }> = {
  BASE: { nombre: 'Founding Studio', precioMes: 29, resumen: 'Sin límite de alumnas ni de reservas. Centro de Control, sustituciones automáticas y redacción con IA, aparte.' },
  ESTUDIO: { nombre: 'Estudio', precioMes: 59, resumen: 'Todo lo de Founding Studio con Centro de Control, sustituciones automáticas y redacción con IA incluidos, y más consultas al asistente.' },
  CADENA: { nombre: 'Cadena', precioMes: 149, resumen: 'Multi-centro y todo incluido.' },
};

export const PLANES: Plan[] = ['BASE', 'ESTUDIO', 'CADENA'];

/**
 * Founding Studio tal como era hasta el 19-oct-2026: todo menos varias sedes y
 * la app propia. Es lo que tienen quien ya lo pagaba antes de los complementos
 * (lo conservan sin pagar más, decisión del fundador), quien está en la prueba
 * gratuita y quien no ha pasado por el checkout nuevo (`regimenAddons` falso).
 */
export const BASE_COMPLETO: Entitlements = {
  ...PLAN_ENTITLEMENTS.BASE,
  features: { ...PLAN_ENTITLEMENTS.BASE.features, ia: true, decisiones: true, sustitucionesAutonomas: true },
};

// ─── Complementos (add-ons) de Founding Studio ───────────────────────────────
// Decisión del fundador (19-oct-2026): sobre los 29 € de Founding se contratan
// por meses, cada uno como una línea más de la misma suscripción de Stripe
// (29 + 6 = 35 €/mes). Estudio y Cadena ya los traen todos. El gratis también
// los trae; al pasar a pagar Founding, se quedan fuera hasta contratarlos.
// ⚠️ El id es lo que se guarda en `studios.addons` (CHECK en la migración) y
// lo que mapea `STRIPE_PRICE_ADDON_*`: no se renombra.
export type Addon = 'decisiones' | 'sustituciones' | 'ia';

export interface InfoAddon {
  nombre: string;
  precioMes: number;
  resumen: string;
  /** Qué features enciende. */
  features: ReadonlyArray<keyof Entitlements['features']>;
}

export const ADDONS: Record<Addon, InfoAddon> = {
  decisiones: {
    nombre: 'Centro de Control', precioMes: 9,
    resumen: 'Un solo aviso al día con lo que merece tu atención, y el piloto automático.',
    features: ['decisiones'],
  },
  sustituciones: {
    nombre: 'Sustituciones automáticas', precioMes: 6,
    resumen: 'Busca sustituta, avisa y cierra la sustitución sin ti (modos Autónomo y Vacaciones).',
    features: ['sustitucionesAutonomas'],
  },
  ia: {
    nombre: 'Redacción con IA', precioMes: 9,
    resumen: 'Notas de sesión, campañas y los mensajes de tus automatizaciones redactados con IA.',
    features: ['ia'],
  },
};

export const LISTA_ADDONS: Addon[] = ['decisiones', 'sustituciones', 'ia'];

export function esAddon(x: unknown): x is Addon {
  return typeof x === 'string' && (LISTA_ADDONS as string[]).includes(x);
}

/** El complemento que da esta feature, si es de las que se contratan aparte. */
export function addonDeFeature(feature: keyof Entitlements['features']): Addon | null {
  return LISTA_ADDONS.find((a) => ADDONS[a].features.includes(feature)) ?? null;
}

/**
 * Lo que un estudio necesita para decidir sus features. `regimenAddons` y
 * `addons` son opcionales A PROPÓSITO: quien no los lee (una consulta que no
 * pide esas columnas) cae en el Founding completo de siempre. Es el fallo
 * menos malo: regalar un complemento antes que quitarle a quien paga lo que
 * ya tenía. Las puertas de los tres complementos SÍ los leen (lo vigila
 * `lib/billing/addons-puertas.test.ts`).
 */
export interface EstudioConPlan {
  plan?: string | null;
  subscriptionStatus?: string | null;
  /** `studios.regimen_addons`: pagó Founding por el checkout nuevo. */
  regimenAddons?: boolean | null;
  /** `studios.addons`: complementos contratados (los escribe el webhook). */
  addons?: readonly string[] | null;
}

/** Columnas de `studios` que hacen falta para `entitlementsDe` / `tieneFeature`. */
export const COLUMNAS_PLAN = 'plan, subscription_status, regimen_addons, addons';

/** Fila de `studios` (con COLUMNAS_PLAN) → lo que espera `tieneFeature`. */
export function planDeFila(fila: { plan?: string | null; subscription_status?: string | null; regimen_addons?: boolean | null; addons?: readonly string[] | null } | null | undefined): EstudioConPlan {
  return {
    plan: fila?.plan ?? null,
    subscriptionStatus: fila?.subscription_status ?? null,
    regimenAddons: fila?.regimen_addons ?? null,
    addons: fila?.addons ?? null,
  };
}

/** ¿Este estudio paga los complementos aparte (Founding con régimen nuevo)? */
export function pagaAddonsAparte(studio: EstudioConPlan): boolean {
  if (studio.subscriptionStatus === 'gratis' || studio.subscriptionStatus === 'gratis_cerrado') return false;
  return planDe(studio) === 'BASE' && studio.regimenAddons === true;
}

/** Lo que paga al mes: el plan más sus complementos (IVA incluido, como los precios). */
export function precioMensual(plan: Plan, addons: readonly string[]): number {
  return PLAN_INFO[plan].precioMes + LISTA_ADDONS.filter((a) => addons.includes(a)).reduce((t, a) => t + ADDONS[a].precioMes, 0);
}

/** Complementos contratados y válidos (lo que no es un id conocido, fuera). */
export function addonsDe(studio: EstudioConPlan): Addon[] {
  return LISTA_ADDONS.filter((a) => (studio.addons ?? []).includes(a));
}

/**
 * Founding Studio GRATIS (decisión del fundador, 15-oct-2026; reglas en
 * plan-gratis.ts): un estudio con `subscription_status = 'gratis'` usa TODO
 * Tentare salvo varias sedes y la app propia, hasta 150 alumnas activas y 250
 * reservas al mes.
 * Lo que cuesta dinero por uso va con tope: el asistente, 50 consultas al mes
 * (el `plan` de la fila es 'BASE', así que `ia_cuota_mensual()` en SQL da el
 * mismo 50), y la IA de notas, campañas y fichas, TOPE_IA_GRATIS_DIA al día
 * (lib/billing/billing-guard.ts). Con 'gratis_cerrado' no hay acceso: estas
 * features dan igual, porque `suscripcionActiva` dice que no.
 */
export const ENTITLEMENTS_GRATIS: Entitlements = {
  maxSocios: 150,
  features: { gamificacion: true, marketing: true, ia: true, multiCentro: false, decisiones: true, marca: true, sustitucionesAutonomas: true, asistente: true, appPropia: false },
  consultasAsistenteMes: 50,
};

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
  // 'gratis': Founding Studio gratis (plan-gratis.ts). Da acceso; si se cierra
  // por pasarse del margen, lo decide el gate (`/api/billing/status`), no esto.
  return status === 'active' || status === 'trialing' || status === 'past_due' || status === 'gratis';
}

/** ¿Este estudio puede usar el producto? En prueba (trialing) o con suscripción activa. */
export function accesoProducto(studio: { subscriptionStatus?: string | null }): boolean {
  return suscripcionActiva(studio.subscriptionStatus);
}

function planDe(studio: { plan?: string | null }): Plan {
  const p = studio.plan;
  return p === 'ESTUDIO' || p === 'CADENA' ? p : 'BASE';
}

/**
 * Entitlements efectivos del estudio: el gratis si lo es; Estudio y Cadena,
 * los de su plan; Founding, el de siempre (BASE_COMPLETO) salvo que lo pague
 * con el régimen de complementos, y entonces el núcleo más lo contratado.
 */
export function entitlementsDe(studio: EstudioConPlan): Entitlements {
  if (studio.subscriptionStatus === 'gratis' || studio.subscriptionStatus === 'gratis_cerrado') return ENTITLEMENTS_GRATIS;
  const plan = planDe(studio);
  if (plan !== 'BASE') return PLAN_ENTITLEMENTS[plan];
  if (!pagaAddonsAparte(studio)) return BASE_COMPLETO;
  const features = { ...PLAN_ENTITLEMENTS.BASE.features };
  for (const a of addonsDe(studio)) for (const f of ADDONS[a].features) features[f] = true;
  return { ...PLAN_ENTITLEMENTS.BASE, features };
}

/** ¿El estudio tiene acceso a una feature concreta (y suscripción activa)? */
export function tieneFeature(
  studio: EstudioConPlan,
  feature: keyof Entitlements['features'],
): boolean {
  return accesoProducto(studio) && entitlementsDe(studio).features[feature];
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
