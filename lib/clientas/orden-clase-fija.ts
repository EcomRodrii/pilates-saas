// Ordenar la lista de clientas por el día y la hora de su clase fija (petición de
// un estudio, 10-nov-2026): «que la lista se ordene por día y hora de su clase
// fija». Lógica pura; la pantalla solo la pinta.
//
// Una clienta puede tener varias clases fijas (lunes y miércoles). Manda la
// PRIMERA de la semana (lunes primero, como el calendario); las demás salen en
// el texto («lun 10:00 +1»). Quien no tiene ninguna viva va siempre al final,
// mire el orden hacia donde mire: ordenar por clase fija es para ver quién tiene
// una, no para empezar por las que no.

import { plazaFijaViva } from '../student/plaza-fija.ts';
import type { PlazaFija } from '../types.ts';

const DIA_CORTO = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

export interface ClaseFijaDeClienta {
  /** Para comparar: día (lunes = 1 … domingo = 7) × 10.000 + minutos desde las 00:00. */
  readonly clave: number;
  /** «lun 10:00», o «lun 10:00 +1» si tiene más clases fijas. */
  readonly texto: string;
}

function claveDe(p: Pick<PlazaFija, 'diaSemana' | 'horaInicio'>): number {
  const dia = p.diaSemana === 0 ? 7 : p.diaSemana; // el domingo, al final de la semana
  const [h, m] = p.horaInicio.split(':');
  return dia * 10_000 + (Number(h) || 0) * 60 + (Number(m) || 0);
}

function textoDe(p: Pick<PlazaFija, 'diaSemana' | 'horaInicio'>): string {
  return `${DIA_CORTO[p.diaSemana] ?? '—'} ${p.horaInicio.slice(0, 5)}`;
}

/** La clase fija que ordena a cada clienta (la primera de la semana); sin entrada = no tiene. */
export function clasesFijasPorClienta(
  plazas: readonly PlazaFija[],
  hoyISO?: string,
): Map<string, ClaseFijaDeClienta> {
  const porSocio = new Map<string, PlazaFija[]>();
  for (const p of plazas) {
    if (!plazaFijaViva(p, hoyISO)) continue;
    const lista = porSocio.get(p.socioId);
    if (lista) lista.push(p); else porSocio.set(p.socioId, [p]);
  }
  const salida = new Map<string, ClaseFijaDeClienta>();
  for (const [socioId, lista] of porSocio) {
    lista.sort((a, b) => claveDe(a) - claveDe(b));
    const primera = lista[0];
    salida.set(socioId, {
      clave: claveDe(primera),
      texto: lista.length > 1 ? `${textoDe(primera)} +${lista.length - 1}` : textoDe(primera),
    });
  }
  return salida;
}

/**
 * Comparador para `sort`: ascendente = lunes temprano primero. Las que no tienen
 * clase fija quedan SIEMPRE al final (`dir` no las mueve); el empate lo resuelve
 * el nombre, que es lo que espera quien mira la lista.
 */
export function compararPorClaseFija(
  a: { id: string; nombre: string },
  b: { id: string; nombre: string },
  fijas: ReadonlyMap<string, ClaseFijaDeClienta>,
  dir: 'asc' | 'desc',
): number {
  const fa = fijas.get(a.id);
  const fb = fijas.get(b.id);
  if (!fa && !fb) return a.nombre.localeCompare(b.nombre, 'es');
  if (!fa) return 1;
  if (!fb) return -1;
  const cmp = fa.clave - fb.clave;
  if (cmp !== 0) return dir === 'asc' ? cmp : -cmp;
  return a.nombre.localeCompare(b.nombre, 'es');
}
