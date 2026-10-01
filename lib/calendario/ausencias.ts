// ─────────────────────────────────────────────────────────────────────────────
// Clases ya programadas que se quedan sin su instructora: vacaciones, baja o un
// bloqueo de agenda grabado DESPUÉS de hacer el horario.
//
// Una sola regla para el Decision OS (A5, lib/decision/especialistas/agenda.ts)
// y para el calendario. Antes vivía dentro de A5 y el calendario no la miraba,
// así que una clase con la instructora de vacaciones salía en la rejilla como si
// nada: «Con Laura».
//
// Los bloqueos viven en `instructora_disponibilidad_excepciones` (tipo='bloqueo'),
// uno por día: las vacaciones y bajas de `instructora_ausencias` se materializan
// ahí (migr 0101, columna `ausencia_id`). Una tabla para mirar, no dos.
//
// ⚠️ Esto solo lo CUENTA. No reabre #558: confirmar una ausencia no dispara
// ninguna sustitución sobre las clases ya programadas.
//
// Import relativo con extensión `.ts`: lo prueba `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

import { franjaLocalDe, hoyEnEstudio } from '../utils.ts';

export interface BloqueoAgenda {
  instructorId: string;
  /** Día local del estudio, 'YYYY-MM-DD'. */
  fecha: string;
  horaInicio: string | null;
  horaFin: string | null;
  /** La ausencia de la que sale el bloqueo (vacaciones, baja…). null = bloqueo suelto. */
  ausenciaId?: string | null;
}

export type TipoAusencia = 'VACACIONES' | 'BAJA_MEDICA' | 'OTRO';

export interface AusenciaDeClase {
  tipo: TipoAusencia;
  /** Del primer al último día de la ausencia ('YYYY-MM-DD'); un bloqueo suelto, ese día. */
  desde: string;
  hasta: string;
}

/** ¿El bloqueo pisa a la sesión? Sin horas = el día entero. */
export function bloqueoPisaSesion(b: Pick<BloqueoAgenda, 'horaInicio' | 'horaFin'>, inicio: Date, fin: Date): boolean {
  if (!b.horaInicio || !b.horaFin) return true;
  const hhmm = (t: string) => { const [h, m] = t.split(':'); return Number(h) * 60 + Number(m); };
  const { hora: hIni, minuto: mIni } = franjaLocalDe(inicio.toISOString());
  const { hora: hFin, minuto: mFin } = franjaLocalDe(fin.toISOString());
  return hhmm(b.horaInicio) < hFin * 60 + mFin && hhmm(b.horaFin) > hIni * 60 + mIni;
}

/** Día local del estudio en 'YYYY-MM-DD' (los bloqueos se guardan por día). */
export function diaLocalDe(iso: string): string {
  return hoyEnEstudio(new Date(iso));
}

/** La ausencia que deja a esta clase sin su instructora, o null si no hay ninguna. */
export function ausenciaDeSesion(
  s: { instructorId: string | null; inicio: string; fin: string },
  bloqueos: readonly BloqueoAgenda[],
  ausencias: ReadonlyMap<string, { tipo: string; desde: string; hasta: string }>,
): AusenciaDeClase | null {
  if (!s.instructorId) return null;
  const dia = diaLocalDe(s.inicio);
  const inicio = new Date(s.inicio);
  const fin = new Date(s.fin);
  const b = bloqueos.find(x => x.instructorId === s.instructorId && x.fecha === dia && bloqueoPisaSesion(x, inicio, fin));
  if (!b) return null;
  const a = b.ausenciaId ? ausencias.get(b.ausenciaId) : undefined;
  if (!a) return { tipo: 'OTRO', desde: b.fecha, hasta: b.fecha };
  return { tipo: a.tipo === 'VACACIONES' || a.tipo === 'BAJA_MEDICA' ? a.tipo : 'OTRO', desde: a.desde, hasta: a.hasta };
}

/** Por qué falta, en pocas palabras: «Sin instructora · de vacaciones». */
export function textoAusencia(tipo: TipoAusencia): string {
  return tipo === 'VACACIONES' ? 'de vacaciones' : tipo === 'BAJA_MEDICA' ? 'de baja' : 'no está disponible';
}
