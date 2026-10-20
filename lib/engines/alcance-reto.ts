// A quién cuenta un reto y desde cuándo. Puro y sin dependencias de la app: lo
// usan el servidor (evaluarRetosServidor), el motor (challenge-engine) y la app
// de la alumna, y lo prueba `node --test`.
//
// Dos alcances:
//  · ESTUDIO      → cuentan todas, sin botón. Lo que había hasta ahora.
//  · INSCRIPCION  → solo las que se apuntan, y solo lo posterior a apuntarse.
//
// El reto vive en el calendario de MADRID: empieza a las 00:00 del día de inicio
// y acaba al terminar el día de fin, sin importar en qué zona lo guardó el panel
// (guardaba medianoche UTC al inicio y 23:59:59 del navegador al fin).

import { TZ_ESTUDIO, finDelDiaEstudio, hoyEnEstudio, inicioDelDiaEstudio } from '../utils.ts';

export type AlcanceReto = 'ESTUDIO' | 'INSCRIPCION';

/** Lo que no es exactamente ESTUDIO es INSCRIPCION: ante la duda, nadie queda inscrita sola. */
export function alcanceDe(valor: unknown): AlcanceReto {
  return valor === 'ESTUDIO' ? 'ESTUDIO' : 'INSCRIPCION';
}

/** 'YYYY-MM-DD' (o instante ISO) → el día de calendario de Madrid. */
export function diaMadrid(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return hoyEnEstudio(d, TZ_ESTUDIO);
}

export interface RetoFechas { fechaInicio: string; fechaFin: string }
export interface Inscripcion { creadaEn: string; bajaEn?: string | null }

/** ¿Está el reto en marcha en este instante (calendario de Madrid, ambos días incluidos)? */
export function retoEnMarcha(reto: RetoFechas, ahora: Date): boolean {
  const dia = hoyEnEstudio(ahora, TZ_ESTUDIO);
  return diaMadrid(reto.fechaInicio) <= dia && dia <= diaMadrid(reto.fechaFin);
}

/** ¿Ha terminado ya? Una alumna no puede apuntarse a un reto cerrado. */
export function retoTerminado(reto: RetoFechas, ahora: Date): boolean {
  return hoyEnEstudio(ahora, TZ_ESTUDIO) > diaMadrid(reto.fechaFin);
}

/**
 * ¿Se evalúa este reto para esta alumna? ESTUDIO: sí. INSCRIPCION: solo si tiene
 * una inscripción sin dar de baja. Sin esto, cada reserva crearía progreso a
 * todas las alumnas, se hayan apuntado o no.
 */
export function leCuentaElReto(alcance: AlcanceReto, inscripcion: Inscripcion | null | undefined): boolean {
  if (alcance === 'ESTUDIO') return true;
  return Boolean(inscripcion) && !inscripcion!.bajaEn;
}

export interface VentanaReto {
  /** Primer instante que cuenta (incluido). */
  desde: Date;
  /** Fin del último día del reto (excluido). */
  hasta: Date;
  /** Mismos límites como día de Madrid, para lo que se fecha por día (altas). */
  diaDesde: string;
  diaHasta: string;
}

/**
 * Lo que cuenta de un reto: del inicio (00:00 de Madrid) al final del día de fin,
 * y, si es con inscripción, no antes del instante en que se apuntó. Apuntarse
 * antes del inicio no adelanta nada; apuntarse tarde no recupera lo ya hecho.
 */
export function ventanaDelReto(reto: RetoFechas, inscritaEn?: string | null): VentanaReto {
  const diaInicio = diaMadrid(reto.fechaInicio);
  const diaHasta = diaMadrid(reto.fechaFin);
  let desde = new Date(inicioDelDiaEstudio(diaInicio));
  if (inscritaEn) {
    const t = new Date(inscritaEn);
    if (!Number.isNaN(t.getTime()) && t > desde) desde = t;
  }
  return {
    desde,
    hasta: new Date(finDelDiaEstudio(diaHasta)),
    diaDesde: diaMadrid(desde.toISOString()),
    diaHasta,
  };
}

/** Estados de una reserva que de verdad ocupan plaza para un reto de «reservar». */
const ESTADOS_QUE_RESERVAN = new Set(['CONFIRMADA', 'ASISTIDA']);

/**
 * Las reservas que cuentan para la métrica del reto dentro de su ventana.
 * `RESERVAS_TOTALES` no cuenta canceladas, lista de espera, pendientes de
 * aprobación ni faltas (reservar y cancelar no puede dar el reto).
 */
export function reservasDelReto<R extends { sesionId: string; estado: string }>(
  metric: string,
  reservas: readonly R[],
  inicioDeSesion: ReadonlyMap<string, string>,
  ventana: VentanaReto,
): R[] {
  return reservas.filter((r) => {
    const inicio = inicioDeSesion.get(r.sesionId);
    if (!inicio) return false;
    const d = new Date(inicio);
    if (!(d >= ventana.desde && d < ventana.hasta)) return false;
    if (metric === 'RESERVAS_TOTALES') return ESTADOS_QUE_RESERVAN.has(r.estado);
    return true;
  });
}

/** Las amigas que cuentan para «invitar amigas»: las dadas de alta DENTRO de la ventana. */
export function referidasDelReto<S extends { fechaAlta: string }>(referidas: readonly S[], ventana: VentanaReto): S[] {
  return referidas.filter((s) => {
    if (!s.fechaAlta) return false;
    const dia = diaMadrid(s.fechaAlta);
    return dia >= ventana.diaDesde && dia <= ventana.diaHasta;
  });
}

/**
 * ¿Puede apuntarse ahora? Solo a un reto activo, con inscripción y que no haya
 * terminado. Devuelve el motivo si no (texto para la alumna).
 */
export function puedeApuntarse(
  reto: RetoFechas & { activo: boolean; alcance: AlcanceReto }, ahora: Date,
): { ok: true } | { ok: false; error: string } {
  if (!reto.activo) return { ok: false, error: 'Ese reto no existe.' };
  if (reto.alcance !== 'INSCRIPCION') return { ok: false, error: 'Este reto cuenta para todo el estudio: no hace falta apuntarse.' };
  if (retoTerminado(reto, ahora)) return { ok: false, error: 'Este reto ya ha terminado.' };
  return { ok: true };
}
