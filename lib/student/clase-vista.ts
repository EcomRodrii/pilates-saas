// ─────────────────────────────────────────────────────────────────────────────
// Lo que la ficha de una clase enseña de un vistazo a la instructora: cuánto se
// ha llenado y cuándo podrá pasar lista.
//
// Puro y sin dependencias de navegador: se prueba con `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

import { LISTA_ABRE_MIN_ANTES, puedePasarLista } from './agenda-instructora.ts';

export interface Ocupacion {
  confirmadas: number;
  aforo: number;
  libres: number;
  /** 0–100, para la barra. Con aforo 0 (mal configurado) cuenta como llena si hay alguien. */
  porcentaje: number;
}

export function ocupacion(clase: { confirmadas: number; aforo: number }): Ocupacion {
  const aforo = Math.max(0, clase.aforo);
  const confirmadas = Math.max(0, clase.confirmadas);
  const libres = Math.max(0, aforo - confirmadas);
  const porcentaje = aforo > 0 ? Math.min(100, Math.round((confirmadas / aforo) * 100)) : (confirmadas > 0 ? 100 : 0);
  return { confirmadas, aforo, libres, porcentaje };
}

/** «Quedan 3 plazas», «Queda 1 plaza», «Completa». */
export function textoPlazasLibres(o: Ocupacion): string {
  if (o.aforo > 0 && o.libres === 0) return 'Completa';
  return o.libres === 1 ? 'Queda 1 plaza' : `Quedan ${o.libres} plazas`;
}

function horaMenos(hhmm: string, minutos: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = ((h * 60 + m - minutos) % 1440 + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * «Podrás pasar lista desde las 17:00» mientras falta para que se abra; null si
 * ya se puede, si la clase está cancelada o si ya pasó la ventana.
 * `hora` es la de la clase en la zona del estudio (la que ve en su agenda).
 */
export function textoAperturaLista(
  clase: { inicio: string; fin: string; hora: string; cancelada: boolean }, ahoraMs: number,
): string | null {
  if (clase.cancelada || puedePasarLista(clase, ahoraMs)) return null;
  const abreMs = Date.parse(clase.inicio) - LISTA_ABRE_MIN_ANTES * 60_000;
  if (ahoraMs >= abreMs) return null;
  return `Podrás pasar lista desde las ${horaMenos(clase.hora, LISTA_ABRE_MIN_ANTES)}`;
}
