// El traje de Tenti en ESTE navegador: el de temporada (lo de siempre), uno
// forzado o ninguno. No pasa por el
// servidor, y todos los Tentis cambian al momento (un evento en esta pestaña,
// `storage` en las demás).
//
// Existe para que el fundador vea el panel con el gorro antes de su temporada
// (/interno/tenti › «En este navegador, el panel lleva») sin que lo vea nadie
// más. Ningún estudio tiene dónde tocarlo: para ellos manda la temporada.
//
// `getSnapshot` devuelve un string o null, el mismo durante todo el día: no
// hay bucle por milisegundos (memoria «getSnapshot Date.now»). Una pestaña
// abierta la noche del 1 al 2 de noviembre conserva el gorro hasta que algo la
// vuelva a pintar. Se acepta. En el servidor (y al hidratar), sin traje: el
// SVG de reserva sale sin gorro y no hay desajuste.

import { useSyncExternalStore } from 'react';
import { CLAVE_TRAJE, SIN_TRAJE, esTraje, trajeElegido, type Traje } from './trajes.ts';

const EVENTO = 'tenti-traje-cambio';

/** Lo que este navegador pide: un traje, 'ninguno' o null (el de temporada). */
export type PreferenciaTraje = Traje | typeof SIN_TRAJE | null;

// Lo que se pidió en esta pestaña, por si el almacenamiento no deja escribir.
let enMemoria: { v: PreferenciaTraje } | null = null;

function almacen(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; }
}

/** Lo guardado en este navegador (sin poder leer: lo de siempre, la temporada). */
export function trajeGuardado(): PreferenciaTraje {
  if (enMemoria) return enMemoria.v;
  let g: string | null = null;
  try { g = almacen()?.getItem(CLAVE_TRAJE) ?? null; } catch { /* la temporada */ }
  return g === SIN_TRAJE || esTraje(g) ? g : null;
}

export function ponerTrajeGuardado(v: PreferenciaTraje): void {
  enMemoria = { v };
  try {
    const a = almacen();
    if (v == null) a?.removeItem(CLAVE_TRAJE); else a?.setItem(CLAVE_TRAJE, v);
  } catch { /* dura lo que la pestaña */ }
  window.dispatchEvent(new Event(EVENTO));
}

/** El traje que lleva Tenti ahora en este navegador. */
export function trajeDeTentiActual(): Traje | null {
  if (typeof window === 'undefined') return null;
  return trajeElegido(trajeGuardado(), new Date());
}

function suscribir(avisar: () => void): () => void {
  const enOtraPestana = (e: StorageEvent) => {
    if (e.key !== CLAVE_TRAJE && e.key !== null) return;
    enMemoria = null;
    avisar();
  };
  window.addEventListener(EVENTO, avisar);
  window.addEventListener('storage', enOtraPestana);
  return () => { window.removeEventListener(EVENTO, avisar); window.removeEventListener('storage', enOtraPestana); };
}

/** El traje, vivo. En el servidor y al hidratar, ninguno. */
export function useTrajeDeTenti(): Traje | null {
  return useSyncExternalStore(suscribir, trajeDeTentiActual, () => null);
}

/** Lo que pide este navegador, vivo (para el selector de /interno/tenti). */
export function usePreferenciaTraje(): PreferenciaTraje {
  return useSyncExternalStore(suscribir, trajeGuardado, () => null);
}
