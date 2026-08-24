// Badges de confianza — docs/NETWORK-IMPLEMENTATION-PLAN.md (sección Badges
// del encargo original). Funciones puras: cada una responde una pregunta
// concreta, nunca "verificado" a secas — mismo principio que ya separa
// completitud de verificación en lib/network/completitud.ts (riesgo #3 de
// docs/NETWORK-AUDIT.md).
//
// Badge 2 ("Perfil completo") NO vive aquí — es privado (solo lo ve la
// dueña del perfil, ver BarraCompletitud) y ya tiene su propio cálculo en
// completitud.ts. Los badges de este fichero son los que puede ver
// CUALQUIER estudio en el perfil público de otra persona.

/** Umbral de "activa recientemente": last_sign_in o última edición dentro de esta ventana. */
const DIAS_ACTIVIDAD_RECIENTE = 30;

export function emailVerificado(emailConfirmedAt: string | null | undefined): boolean {
  return Boolean(emailConfirmedAt);
}

/** Al menos una experiencia confirmada por un estudio real. */
export function experienciaVerificada(estadosVerificacion: readonly string[]): boolean {
  return estadosVerificacion.includes('confirmada');
}

/** Al menos una referencia profesional confirmada. Fase 8 solo LEE
 * `red_referencias` (tabla ya existe desde Fase 1) — la solicitud/token de
 * confirmación es un flujo que todavía no se ha construido, así que este
 * badge no puede activarse aún. No es un bug: se documenta como límite
 * conocido, la función queda lista para cuando ese flujo exista. */
export function referenciaProfesional(referenciasConfirmadas: number): boolean {
  return referenciasConfirmadas > 0;
}

/** Badge 5. Desde F1, `identidadVerificadaEn` la escribe
 * app/api/interno/network/verificaciones-identidad/route.ts — ya no es
 * "siempre false" (docs/NETWORK-AUDIT.md §6 quedó desfasado con esa fase). */
export function identidadVerificada(identidadVerificadaEn: string | null): boolean {
  return Boolean(identidadVerificadaEn);
}

export function activaRecientemente(ultimoAccesoEn: string | null, ahora: Date): boolean {
  if (!ultimoAccesoEn) return false;
  const dias = (ahora.getTime() - new Date(ultimoAccesoEn).getTime()) / (1000 * 60 * 60 * 24);
  return dias >= 0 && dias <= DIAS_ACTIVIDAD_RECIENTE;
}
