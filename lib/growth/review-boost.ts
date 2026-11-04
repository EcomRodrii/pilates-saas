// ─────────────────────────────────────────────────────────────────────────────
// Review Boost — elegibilidad. Lógica pura (sin red, sin Supabase) para poder
// probarla con `node --test` sin levantar nada, mismo criterio que
// lib/onboarding.ts / lib/billing/trial.ts.
//
// "Buen uso" no es "ha pasado el trial" ni «tiene Stripe conectado»: exige
// tiempo de uso y señales de actividad real (clases creadas, socias, planes,
// reservas confirmadas) y ausencia de frustración reciente (tickets de
// soporte). Los umbrales son constantes exportadas a propósito — configurable
// sin reestructurar nada.
//
// 4-nov-2026: antes se exigía `trial_ends_at` ya pasado (en los últimos 30
// días) y Stripe conectado. Con Founding Studio gratis casi nadie conecta
// Stripe y el trial local no marca nada, así que solo 5 de 40 estudios
// llegaron a ser elegibles. Una propietaria que lleva semanas usando el
// producto con reservas reales es justo a quien preguntar, tenga Stripe o no.
// ─────────────────────────────────────────────────────────────────────────────

export const REVIEW_BOOST_UMBRAL_RESERVAS = 5;

/** Días de uso mínimos desde el alta: antes de eso aún no ha visto de qué va. */
export const REVIEW_BOOST_DIAS_DE_USO_MIN = 14;
export const REVIEW_BOOST_MAX_TICKETS_RECIENTES = 0;

/** Días tras un cierre-sin-responder antes de poder volver a enseñar el modal. */
export const REVIEW_BOOST_DIAS_REAPARICION = 14;

/** Tope de veces que se enseña el modal a un mismo estudio (1ª vez + 1 reaparición). */
export const REVIEW_BOOST_MAX_VECES_MOSTRADO = 2;

export interface SenalesReviewBoost {
  /** Días desde el alta del estudio (`studios.creado_en`). `null` = no se sabe: nunca es elegible. */
  diasDeUso: number | null;
  numReservasConfirmadas: number;
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
  if (s.diasDeUso === null || s.diasDeUso < REVIEW_BOOST_DIAS_DE_USO_MIN) return false;
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

/**
 * La regla de «¿le toca el modal a esta persona?»: solo la propietaria, con el estudio ya cargado
 * y `debeMostrarModal`. La comparten el modal y el armazón del panel (que no descarga el modal
 * hasta que le toca), para que no puedan discrepar.
 */
export function reviewBoostToca(estudio: {
  reviewBoostElegibleEn: string | null;
  reviewBoostMostradoEn: string | null;
  reviewBoostPospuestoEn: string | null;
  reviewBoostVecesMostrado: number;
} | null, rol: string | null): boolean {
  return rol === 'PROPIETARIO' && !!estudio && debeMostrarModal(estudio);
}

/**
 * Lo que se apunta en el estudio al ENSEÑAR el modal (no al cerrarlo): cuenta
 * como una vez mostrado y abre el plazo de reaparición. Así «1ª vez + 1
 * reaparición» cuenta VECES QUE SE VIO, también si se recargó o se salió con el
 * modal abierto — que antes no apuntaba nada y lo volvía a sacar en cada carga.
 * Si responde, el servidor borra el pospuesto (lib/growth/review-boost-respondido.ts)
 * y ya no vuelve.
 */
export function cambiosAlMostrar(estudio: {
  reviewBoostMostradoEn: string | null;
  reviewBoostVecesMostrado: number;
}, ahora: Date = new Date()): {
  reviewBoostMostradoEn: string;
  reviewBoostPospuestoEn: string;
  reviewBoostVecesMostrado: number;
} {
  const iso = ahora.toISOString();
  return {
    // La primera vez no se pisa: /interno la enseña.
    reviewBoostMostradoEn: estudio.reviewBoostMostradoEn ?? iso,
    reviewBoostPospuestoEn: iso,
    reviewBoostVecesMostrado: (estudio.reviewBoostVecesMostrado ?? 0) + 1,
  };
}
