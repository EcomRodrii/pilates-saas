// Veri*Factu — la barrera de activación.
//
// Criterio del asesor fiscal (30-sep-2026): las facturas emitidas ANTES de que
// un estudio empiece a funcionar como VERI*FACTU no se envían solas al
// activarlo. Hay que separar las históricas (antes de la activación) de las
// VERI*FACTU (desde la activación), y las primeras solo se remiten con criterio
// escrito para ese caso. La Orden HAC/1177/2024 permite empezar VERI*FACTU en
// cualquier momento; lo que no está claro es si registros generados antes deben
// entrar en la primera remesa, ni cómo se enganchan a la cadena (NO CONFIRMADO).
//
// Dos cerrojos, de la forma más prudente:
//   1. No se ACTIVA un estudio que tenga registros anteriores a su primera
//      activación que la AEAT no tiene (`activarProduccion`).
//   2. El transmisor nunca prepara ni envía un registro anterior a la
//      activación, aunque el estudio llegara a PRODUCCION por otra vía: la
//      cadena de ese estudio se para con motivo ANTERIOR_A_LA_ACTIVACION.
//
// «La activación» es la PRIMERA: `activado_produccion_en` se fija una vez y no
// se mueve al pausar y reanudar, o las facturas emitidas durante una pausa
// (que sí son VERI*FACTU) pasarían por anteriores.
//
// La salida de la barrera es una DECISIÓN escrita (tabla
// `verifactu_decisiones_anteriores`, criterio del fiscalista del 30-sep-2026):
// las anteriores cubiertas por una decisión NO_REMITIR ni bloquean la
// activación ni se envían nunca, y la cadena continúa desde la última de ellas.

import type { EstadoRegistroVerifactu } from './estado.ts';

/** Lo que la AEAT ya tiene: un registro así nunca bloquea nada. */
const ADMITIDOS_EN_AEAT: ReadonlySet<EstadoRegistroVerifactu> = new Set(['REGISTRADA', 'ACEPTADA_CON_ERRORES', 'ANULADA_EN_AEAT']);
export const ESTADOS_ADMITIDOS_EN_AEAT = [...ADMITIDOS_EN_AEAT];

/** ¿Se generó este registro antes de que el estudio empezara VERI*FACTU? Sin activar, todos lo son. */
export function anteriorALaActivacion(creadoEn: string, activadoEn: string | null): boolean {
  if (!activadoEn) return true;
  return new Date(creadoEn).getTime() < new Date(activadoEn).getTime();
}

/** Una fila de `verifactu_decisiones_anteriores`. */
export interface DecisionAnteriores {
  decision: 'NO_REMITIR' | 'DESHECHA';
  hastaSeq: number;
  creadoEn: string;
}

/**
 * Hasta qué posición de la cadena queda fuera de la remisión, según la decisión
 * VIGENTE (la última del estudio). `null` = ninguna: o no hay decisión o se deshizo.
 */
export function noRemitirHastaSeq(decisiones: readonly DecisionAnteriores[]): number | null {
  const vigente = [...decisiones].sort((a, b) => b.creadoEn.localeCompare(a.creadoEn))[0];
  return vigente?.decision === 'NO_REMITIR' ? vigente.hastaSeq : null;
}

/** ¿Este registro queda fuera de la remisión por la decisión vigente? Solo si es anterior a la activación. */
export function noRemitidoPorDecision(
  r: { seq: number; creadoEn: string }, activadoEn: string | null, hastaSeq: number | null,
): boolean {
  return hastaSeq !== null && r.seq <= hastaSeq && anteriorALaActivacion(r.creadoEn, activadoEn);
}

/**
 * Cuántos registros impiden activar: anteriores a la activación, que la AEAT no
 * tiene y que ninguna decisión NO_REMITIR cubre.
 */
export function registrosQueBloqueanActivacion(
  registros: readonly { estado: EstadoRegistroVerifactu; creadoEn: string; seq?: number }[],
  activadoEn: string | null,
  hastaSeq: number | null = null,
): number {
  return registros.filter(r =>
    !ADMITIDOS_EN_AEAT.has(r.estado)
    && anteriorALaActivacion(r.creadoEn, activadoEn)
    && !(r.seq !== undefined && noRemitidoPorDecision({ seq: r.seq, creadoEn: r.creadoEn }, activadoEn, hastaSeq)),
  ).length;
}

export function mensajeBloqueoActivacion(n: number): string {
  const facturas = n === 1 ? '1 factura emitida' : `${n} facturas emitidas`;
  return `Este estudio tiene ${facturas} antes de activar VERI*FACTU que la AEAT no tiene. `
    + 'No se activa hasta registrar la decisión sobre ellas, con su criterio escrito: no se envían solas.';
}
