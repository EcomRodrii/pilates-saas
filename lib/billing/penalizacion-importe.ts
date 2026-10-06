// ─────────────────────────────────────────────────────────────────────────────
// El IMPORTE de una penalización: qué se detecta y qué de eso se puede cobrar.
//
// Lo comparten el guardia de cobro (`penalizacion-consentimiento.ts`, cron y ruta
// de aprobar) y la app de la alumna, que avisa ANTES de cancelar tarde. Una sola
// regla para las dos: la app no puede prometer un cargo que el guardia no dejaría
// cobrar, ni callarse uno que sí. Solo importa `legal-textos.ts` (puro, sin `@/`).
// ─────────────────────────────────────────────────────────────────────────────

import { horasCancelacionContrato } from '../legal-textos.ts';

/** Euros a céntimos, o `null` si no es un número. */
export function centimos(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/**
 * ¿Recoge el contrato este importe? El contrato que acepta la alumna solo lleva el
 * importe del ESTUDIO (`lib/legal-textos.ts`), así que un cargo se cubre solo si es
 * exactamente ese, y el estudio tiene uno. El de un tipo de clase con importe
 * propio no está en el contrato: no se cobra.
 */
export function importeDelContrato(
  importeEstudio: number | string | null | undefined,
  importeCargo: number | string | null | undefined,
): { ok: true } | { ok: false; motivo: 'estudio_sin_penalizacion' | 'importe_distinto' } {
  const contrato = centimos(importeEstudio);
  if (contrato === null || contrato <= 0) return { ok: false, motivo: 'estudio_sin_penalizacion' };
  if (centimos(importeCargo) !== contrato) return { ok: false, motivo: 'importe_distinto' };
  return { ok: true };
}

/**
 * Lo que de verdad se le cobraría por cancelar TARDE una clase concreta, o `null`:
 * 1. Lo que DETECTA `cancelar_reserva_plaza`: solo si el estudio cobra las
 *    cancelaciones tardías (`penalizacion_aplica_cancelacion_tardia`, por defecto
 *    sí), y el importe es coalesce(el del tipo de clase de ESA sesión, el del
 *    estudio) mayor que 0 (un 0 en el tipo es «sin penalización», no «hereda»).
 * 2. Y que deje pasar el contrato (`importeDelContrato`), que con términos
 *    propios del estudio no deja pasar nada (`terminos_propios`).
 * CUÁNDO se cobraría lo dice `horasDeCobroTardio`. Que se cobre depende además de
 * su tarjeta y de lo que firmó: quien lo enseñe dice «puede».
 */
export function penalizacionTardiaQueSeCobraria(p: {
  aplicaTardia: boolean | null | undefined;
  importeEstudio: number | null | undefined;
  /** El del tipo de clase de la sesión que se cancela. `null`/`undefined` = hereda el del estudio. */
  importeTipoSesion: number | null | undefined;
  /** El estudio tiene términos de servicio propios: el guardia nunca cobra (`terminos_propios`). */
  terminosPropios?: boolean | null;
}): number | null {
  if (p.aplicaTardia === false) return null;
  if (p.terminosPropios === true) return null;
  const detectado = p.importeTipoSesion ?? p.importeEstudio ?? null;
  if (detectado === null || !(detectado > 0)) return null;
  if (!importeDelContrato(p.importeEstudio, detectado).ok) return null;
  return p.importeEstudio ?? null;
}

/**
 * Hasta cuántas horas antes del inicio cancelar se COBRARÍA, o `null` si nunca.
 * - La detección (`cancelar_reserva_plaza`) usa la ventana resuelta: la del tipo de
 *   clase de ESA sesión o, si no tiene, la del estudio; sin ventana no detecta nada.
 * - El guardia (`consentimientoCubrePenalizacion`) solo deja cobrar dentro de la
 *   ventana del CONTRATO (`horasCancelacionContrato`, la del estudio).
 * Se cobra solo dentro de las dos: la menor. Con un tipo de 24 h en un estudio de
 * 12 h, cancelar a 18 h se detecta pero no se cobra, y la app no puede avisar.
 */
export function horasDeCobroTardio(p: {
  ventanaTipoSesion: number | null | undefined;
  ventanaEstudio: number | null | undefined;
}): number | null {
  const deteccion = p.ventanaTipoSesion ?? p.ventanaEstudio ?? null;
  if (deteccion === null || !(deteccion > 0)) return null;
  return Math.min(deteccion, horasCancelacionContrato({ cancelacionVentanaHoras: p.ventanaEstudio ?? null }));
}
