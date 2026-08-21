// ─────────────────────────────────────────────────────────────────────────────
// Review Boost — elegibilidad. Lógica pura (sin red, sin Supabase) para poder
// probarla con `node --test` sin levantar nada, mismo criterio que
// lib/onboarding.ts / lib/billing/trial.ts.
//
// "Buen uso" no es "ha pasado el trial": exige señales de actividad real
// (Stripe conectado, clases creadas, socias, planes, reservas confirmadas) y
// ausencia de frustración reciente (tickets de soporte). Los umbrales son
// constantes exportadas a propósito — configurable sin reestructurar nada.
// ─────────────────────────────────────────────────────────────────────────────

export const REVIEW_BOOST_UMBRAL_RESERVAS = 3;
export const REVIEW_BOOST_MAX_TICKETS_RECIENTES = 0;

/** Días tras un cierre-sin-responder antes de poder volver a enseñar el modal. */
export const REVIEW_BOOST_DIAS_REAPARICION = 14;

/** Tope de veces que se enseña el modal a un mismo estudio (1ª vez + 1 reaparición). */
export const REVIEW_BOOST_MAX_VECES_MOSTRADO = 2;

export interface SenalesReviewBoost {
  /** `studios.trial_ends_at`. Sin trial local, nunca es elegible. */
  trialEndsAt: string | null;
  numReservasConfirmadas: number;
  stripeConectado: boolean;
  numSesiones: number;
  numSocios: number;
  numPlanesTarifa: number;
  /** `soporte_solicitudes` de los últimos 14 días. */
  ticketsSoporteRecientes: number;
  yaMostrado: boolean;
  yaDioFeedback: boolean;
  yaRecompensado: boolean;
}

/**
 * ¿Debe el cron marcar a este estudio como elegible para Review Boost? Puro:
 * recibe señales ya calculadas, no decide cuándo se recalculan (eso es del
 * cron, lib/inngest/review-boost.ts).
 */
export function isEligibleForReviewBoost(s: SenalesReviewBoost): boolean {
  if (s.yaMostrado || s.yaDioFeedback || s.yaRecompensado) return false;
  if (!s.trialEndsAt) return false;
  if (!s.stripeConectado) return false;
  if (s.numSesiones === 0 || s.numSocios === 0 || s.numPlanesTarifa === 0) return false;
  if (s.numReservasConfirmadas < REVIEW_BOOST_UMBRAL_RESERVAS) return false;
  if (s.ticketsSoporteRecientes > REVIEW_BOOST_MAX_TICKETS_RECIENTES) return false;
  return true;
}

/** ¿Toca volver a enseñar el modal tras un cierre sin responder? */
export function debeReaparecer(pospuestoEn: string | null, vecesMostrado: number, ahora: Date = new Date()): boolean {
  if (!pospuestoEn) return false;
  if (vecesMostrado >= REVIEW_BOOST_MAX_VECES_MOSTRADO) return false;
  const dias = (ahora.getTime() - new Date(pospuestoEn).getTime()) / 86_400_000;
  return dias >= REVIEW_BOOST_DIAS_REAPARICION;
}

/** ¿Debe mostrarse el modal ahora mismo, dado el estado persistido del estudio? */
export function debeMostrarModal(estudio: {
  reviewBoostElegibleEn: string | null;
  reviewBoostMostradoEn: string | null;
  reviewBoostPospuestoEn: string | null;
  reviewBoostVecesMostrado: number;
}, ahora: Date = new Date()): boolean {
  if (!estudio.reviewBoostElegibleEn) return false;
  if (!estudio.reviewBoostMostradoEn) return true; // 1ª vez
  return debeReaparecer(estudio.reviewBoostPospuestoEn, estudio.reviewBoostVecesMostrado, ahora);
}
