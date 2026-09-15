// Plaza fija desde la app de la alumna: las reglas puras de las solicitudes y de
// la vuelta de una pausa que liberó su sitio (migr 20260915231920).
//
// Decisiones del fundador (16-sep-2026): el estudio controla las reglas y Tentare
// las automatiza. Hasta que el estudio aprueba, la plaza real no cambia; pasar del
// límite semanal no bloquea la petición (decide el estudio); rechazar la vuelta de
// una pausa quita la plaza; «sitio libre durante la pausa» vale para todas las
// pausas nuevas.
//
// Puro: se prueba con `node --test`.

import type { PoliticaFinPausa } from './types.ts';

export type { PoliticaFinPausa };
/** Lo que contesta `plaza_fija_hueco_para_volver`. */
export type HuecoParaVolver = 'OK' | 'SIN_CUPO' | 'SITIO_OCUPADO';
export type MotivoVueltaPendiente = 'SIN_CUPO' | 'SITIO_OCUPADO' | 'SIN_CUOTA' | 'SUPERA_LIMITE' | 'PREGUNTAR';

/** Días antes del fin de la pausa en que se decide la vuelta (el motor no reserva dentro del plazo de cancelación). */
export const DIAS_ANTES_DE_DECIDIR_VUELTA = 7;

/**
 * ¿Toca decidir ya la vuelta de esta pausa? Una semana antes de que acabe: así su
 * primera clase tras la pausa no cae dentro del plazo de cancelación y se le puede
 * reservar. Las fechas de la pausa se siguen saltando, así que adelantar la
 * decisión no le da ninguna clase de dentro de la pausa. Fechas YYYY-MM-DD.
 */
export function tocaDecidirVuelta(pausaHasta: string | null, hoy: string): boolean {
  return !!pausaHasta && pausaHasta <= fechaLimiteDecidirVuelta(hoy);
}

/** Las pausas que acaban en esta fecha o antes ya tienen la vuelta por decidir. */
export function fechaLimiteDecidirVuelta(hoy: string): string {
  const limite = new Date(`${hoy}T00:00:00Z`);
  limite.setUTCDate(limite.getUTCDate() + DIAS_ANTES_DE_DECIDIR_VUELTA);
  return limite.toISOString().slice(0, 10);
}

/**
 * ¿Toca dejar ya su sitio libre? Solo si la pausa se puso para liberarlo, ya ha
 * empezado y le queda más de una semana. Antes de empezar la clase sigue siendo
 * suya; en la última semana ya se está decidiendo la vuelta. Por eso una pausa de
 * una semana o menos no llega a soltar el sitio.
 */
export function tocaLiberarSitio(
  p: { pausaDesde: string | null; pausaHasta: string | null; liberaSitio: boolean }, hoy: string,
): boolean {
  return p.liberaSitio && !!p.pausaDesde && p.pausaDesde <= hoy && !tocaDecidirVuelta(p.pausaHasta, hoy);
}

export type DecisionVuelta =
  | { accion: 'VOLVER' }
  | { accion: 'PREGUNTAR'; motivo: MotivoVueltaPendiente }
  | { accion: 'IMPOSIBLE'; motivo: 'SITIO_OCUPADO' };

/**
 * Qué hacer al final de una pausa que dejó su sitio libre.
 * - Sin `forzar` (el cron): vuelve sola solo si el estudio lo configuró así Y hay
 *   hueco, tiene cuota y no pasa de su límite semanal; si no, se le pregunta al
 *   estudio con el motivo.
 * - Con `forzar` (el estudio aprueba la vuelta): vuelve aunque falte cupo o pase de
 *   su límite; lo único que no puede es quitarle el sitio concreto a otra alumna.
 *   Que tenga cuota lo exige quien la llama, como al reanudar desde el panel.
 */
export function decidirVueltaDePausa(p: {
  politica: PoliticaFinPausa;
  hueco: HuecoParaVolver;
  tieneCuota: boolean;
  superaLimite: boolean;
  forzar?: boolean;
}): DecisionVuelta {
  if (p.hueco === 'SITIO_OCUPADO') {
    return p.forzar ? { accion: 'IMPOSIBLE', motivo: 'SITIO_OCUPADO' } : { accion: 'PREGUNTAR', motivo: 'SITIO_OCUPADO' };
  }
  if (p.forzar) return { accion: 'VOLVER' };
  if (p.politica === 'PENDIENTE_CONFIRMAR') return { accion: 'PREGUNTAR', motivo: 'PREGUNTAR' };
  if (p.hueco === 'SIN_CUPO') return { accion: 'PREGUNTAR', motivo: 'SIN_CUPO' };
  if (!p.tieneCuota) return { accion: 'PREGUNTAR', motivo: 'SIN_CUOTA' };
  if (p.superaLimite) return { accion: 'PREGUNTAR', motivo: 'SUPERA_LIMITE' };
  return { accion: 'VOLVER' };
}

/** Por qué no volvió sola, dicho al estudio en la bandeja. */
export function textoMotivoVuelta(motivo: MotivoVueltaPendiente): string {
  switch (motivo) {
    case 'SITIO_OCUPADO': return 'su sitio lo tiene ahora otra alumna';
    case 'SIN_CUPO': return 'su clase está llena de plazas fijas';
    case 'SIN_CUOTA': return 'ya no tiene una cuota que cubra esa clase';
    case 'SUPERA_LIMITE': return 'pasaría del límite de clases por semana de su cuota';
    case 'PREGUNTAR': return 'elegiste confirmar cada vuelta';
  }
}
