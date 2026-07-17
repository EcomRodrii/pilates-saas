import type { Plan } from '@/lib/billing/entitlements';

// ─────────────────────────────────────────────────────────────────────────────
// Billing del SaaS (Stripe Billing — la plataforma cobra al estudio).
// Los price IDs de Stripe viven en env (STRIPE_PRICE_BASE/ESTUDIO/CADENA)
// porque difieren entre test y live. SOLO servidor (no NEXT_PUBLIC).
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

/** Mapea un price ID de Stripe de vuelta a un plan (para el webhook). */
export function planDePriceId(priceId: string | null | undefined): Plan | null {
  if (!priceId) return null;
  const env = priceEnv();
  for (const plan of ['BASE', 'ESTUDIO', 'CADENA'] as Plan[]) {
    if (env[plan] && env[plan] === priceId) return plan;
  }
  return null;
}
