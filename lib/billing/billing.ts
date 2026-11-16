import type { Addon, Plan } from '@/lib/billing/entitlements';

// ─────────────────────────────────────────────────────────────────────────────
// Billing del SaaS (Stripe Billing — la plataforma cobra al estudio).
// Los price IDs de Stripe viven en env (STRIPE_PRICE_BASE/ESTUDIO/CADENA)
// porque difieren entre test y live. SOLO servidor (no NEXT_PUBLIC).
//
// ⚠️ Cambiar uno de estos valores en Vercel NO basta con "Redeploy": el
// `ignoreCommand` de vercel.json cancela el build si el diff de código está
// vacío, y un Redeploy del MISMO commit no genera ningún diff — así que un
// cambio de env var puro se queda sin desplegar en silencio ("Canceled",
// sin más explicación). Hace falta un commit real (aunque sea trivial, como
// este) para forzar el build. Pasó de verdad el 31-ago-2026: un precio de
// prueba a 1€ en Stripe quedó desplegado varios minutos de más porque el
// primer intento de Redeploy no hizo nada.
// ─────────────────────────────────────────────────────────────────────────────

function priceEnv(): Record<Plan, string | undefined> {
  return {
    BASE: process.env.STRIPE_PRICE_BASE,
    ESTUDIO: process.env.STRIPE_PRICE_ESTUDIO,
    CADENA: process.env.STRIPE_PRICE_CADENA,
  };
}

/** price ID de Stripe para un plan, o null si no está configurado. */
export function priceIdDe(plan: Plan): string | null {
  return priceEnv()[plan] ?? null;
}

/**
 * Price IDs HEREDADOS de un plan: los de antes de la subida de precios
 * (16-nov-2026, Estudio 59→79 € y Cadena 149→249 €). Stripe no deja cambiar el
 * importe de un Price, así que el plan nuevo es un Price nuevo y los viejos se
 * quedan vivos con las suscripciones que ya los usan. Solo SE RECONOCEN (para
 * que el webhook no deje `plan = null` a quien conserva el suyo): nunca se
 * venden. Lista separada por comas en `STRIPE_PRICE_<PLAN>_LEGACY`.
 */
function preciosHeredados(plan: Plan): string[] {
  const crudo = process.env[`STRIPE_PRICE_${plan}_LEGACY`] ?? '';
  return crudo.split(',').map((x) => x.trim()).filter(Boolean);
}

/** Mapea un price ID de Stripe de vuelta a un plan (para el webhook). */
export function planDePriceId(priceId: string | null | undefined): Plan | null {
  if (!priceId) return null;
  const env = priceEnv();
  for (const plan of ['BASE', 'ESTUDIO', 'CADENA'] as Plan[]) {
    if (env[plan] && env[plan] === priceId) return plan;
    if (preciosHeredados(plan).includes(priceId)) return plan;
  }
  return null;
}

// ─── Complementos de Founding (ADDONS, lib/billing/entitlements.ts) ──────────
// Un precio MENSUAL de Stripe por complemento, en el mismo producto o en uno
// propio: da igual, se reconocen por el price ID. Sin la env, el complemento no
// se puede contratar (la ruta contesta 503 y la pantalla lo dice).
function priceEnvAddons(): Record<Addon, string | undefined> {
  return {
    decisiones: process.env.STRIPE_PRICE_ADDON_DECISIONES,
    sustituciones: process.env.STRIPE_PRICE_ADDON_SUSTITUCIONES,
    ia: process.env.STRIPE_PRICE_ADDON_IA,
  };
}

/** price ID de Stripe de un complemento, o null si no está configurado. */
export function priceIdDeAddon(addon: Addon): string | null {
  return priceEnvAddons()[addon] ?? null;
}

/**
 * ¿Se pueden contratar ya los tres complementos? Hasta que existan sus precios
 * en Stripe, el checkout sigue vendiendo el Founding completo: quitarle algo a
 * quien no puede comprarlo aparte sería venderle menos por lo mismo.
 */
export function complementosALaVenta(): boolean {
  return (['decisiones', 'sustituciones', 'ia'] as Addon[]).every((a) => !!priceIdDeAddon(a));
}

/**
 * Mapea un price ID de vuelta a su complemento (para leer la suscripción).
 * Como con los planes, los Price de antes de la subida (`STRIPE_PRICE_ADDON_<X>_LEGACY`,
 * lista separada por comas) se reconocen pero no se venden.
 */
export function addonDePriceId(priceId: string | null | undefined): Addon | null {
  if (!priceId) return null;
  const env = priceEnvAddons();
  for (const a of ['decisiones', 'sustituciones', 'ia'] as Addon[]) {
    if (env[a] && env[a] === priceId) return a;
    const heredados = (process.env[`STRIPE_PRICE_ADDON_${a.toUpperCase()}_LEGACY`] ?? '').split(',').map((x) => x.trim()).filter(Boolean);
    if (heredados.includes(priceId)) return a;
  }
  return null;
}
