// Pausa con fechas de una plaza fija (vacaciones, una lesión…).
//
// No es un estado: la plaza sigue ACTIVA y conserva su sitio (la exclusión GiST
// de sitios solo mira las ACTIVAS, así que con PAUSADA otra clienta podía
// quedárselo y al volver chocaba). Entre `pausaDesde` y `pausaHasta`, ambos
// incluidos y en fecha LOCAL del estudio, `materializar_plazas_fijas` no le
// reserva la clase y `plazas_fijas_sin_materializar` no avisa de nada. Al acabar
// vuelve sola: nadie tiene que acordarse de reanudarla.
//
// Mismo criterio que el SQL (migr 20260915090000): si aquel cambia, este también.
// Lógica pura: «hoy» entra por parámetro.

import { hoyEnEstudio } from './utils.ts';

export interface Pausa { desde: string; hasta: string }

type ConPausa = { pausaDesde?: string | null; pausaHasta?: string | null };

/** Una pausa más larga ya no es una pausa: es que no va a volver. */
const MAX_DIAS_PAUSA = 366;
const DIA_MS = 86_400_000;

function fechaValida(ymd: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
  const d = new Date(`${ymd}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === ymd;
}

export function pausaDe(pf: ConPausa): Pausa | null {
  return pf.pausaDesde && pf.pausaHasta ? { desde: pf.pausaDesde, hasta: pf.pausaHasta } : null;
}

export function fechaEnPausa(pf: ConPausa, fechaYmd: string): boolean {
  const p = pausaDe(pf);
  return !!p && fechaYmd >= p.desde && fechaYmd <= p.hasta;
}

/** ¿La clase que empieza en `inicioISO` cae en la pausa? Por su fecha en el estudio, no en UTC. */
export function sesionEnPausa(pf: ConPausa, inicioISO: string): boolean {
  return fechaEnPausa(pf, hoyEnEstudio(new Date(inicioISO)));
}

export type EstadoPausa = 'sin_pausa' | 'en_curso' | 'programada';

/** Una pausa que ya terminó cuenta como `sin_pausa`: la fila se queda, pero ya no dice nada. */
export function estadoPausa(pf: ConPausa, hoy: string): EstadoPausa {
  const p = pausaDe(pf);
  if (!p || p.hasta < hoy) return 'sin_pausa';
  return p.desde <= hoy ? 'en_curso' : 'programada';
}

/** El motivo por el que no se puede guardar, o `null`. «Desde» puede ser pasado: cambiar una pausa ya empezada. */
export function validarPausa(desde: string, hasta: string, hoy: string): string | null {
  if (!fechaValida(desde) || !fechaValida(hasta)) return 'Elige las dos fechas de la pausa.';
  if (hasta < desde) return '«Hasta» no puede ser anterior a «Desde».';
  if (hasta < hoy) return 'Esa pausa ya habría terminado: elige fechas de hoy en adelante.';
  const diasEntre = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DIA_MS);
  if (diasEntre(desde, hasta) + 1 > MAX_DIAS_PAUSA) return 'Una pausa no puede pasar de un año. Si no va a volver, quita la plaza fija.';
  if (diasEntre(hoy, desde) > MAX_DIAS_PAUSA) return 'Esa pausa empieza dentro de más de un año: ponla más adelante.';
  return null;
}

export type ResultadoPausaPlazaFija =
  | { ok: true; canceladas: number; mantenidas: number; fallidas: number; creadas: number }
  | { ok: false; error: string };

function fechaDMY(ymd: string): string {
  const [y, m, d] = ymd.split('-');
  return `${d}/${m}/${y}`;
}

/** Lo que ha pasado de verdad al guardar o quitar la pausa, con las cifras del servidor. */
export function textoTrasPausa(
  r: { canceladas: number; mantenidas: number; fallidas: number; creadas: number },
  pausa: Pausa | null,
): string {
  const partes = [pausa ? `Plaza fija en pausa del ${fechaDMY(pausa.desde)} al ${fechaDMY(pausa.hasta)}` : 'Pausa quitada'];
  if (r.canceladas > 0) partes.push(r.canceladas === 1 ? '1 clase cancelada' : `${r.canceladas} clases canceladas`);
  if (r.mantenidas > 0) {
    partes.push(r.mantenidas === 1
      ? '1 se mantiene por estar dentro del plazo de cancelación'
      : `${r.mantenidas} se mantienen por estar dentro del plazo de cancelación`);
  }
  if (r.fallidas > 0) {
    partes.push(r.fallidas === 1
      ? '1 no se pudo cancelar: revísala en el calendario'
      : `${r.fallidas} no se pudieron cancelar: revísalas en el calendario`);
  }
  if (r.creadas > 0) partes.push(r.creadas === 1 ? '1 clase reservada de nuevo' : `${r.creadas} clases reservadas de nuevo`);
  return partes.join(' · ');
}
