// «Sonidos de Tenti»: si Tenti suena en ESTE dispositivo. Encendido por
// defecto (decisión del fundador, 5-oct-2026); se apaga en Configuración › Tu
// panel › «Solo para ti», junto a claro u oscuro, y como aquel no pasa por el
// servidor: es de este navegador y de nadie más.
//
// Todos los Tentis la leen con `useSonidosDeTenti()` y cambian al momento, sin
// recargar (un evento en esta pestaña, `storage` en las demás). Si el
// almacenamiento no se puede leer (modo privado, bloqueado) vale lo de por
// defecto; si no se puede escribir, el cambio dura lo que dure la pestaña.
//
// Sin el motor ni la síntesis: quien suena por su cuenta (el buscador, los
// botones de IA) llama a `sonarTenti`, que pide ./sonidos.ts aparte.

import { useSyncExternalStore } from 'react';
import type { Sonido } from './sonidos.ts';

export const CLAVE_SONIDOS_TENTI = 'tenti-sonidos';
const EVENTO = 'tenti-sonidos-cambio';

type Leible = Pick<Storage, 'getItem'>;

/** Lo guardado: solo '0' lo apaga. Sin nada (o sin poder leer), encendido. */
export function sonidosGuardados(almacen: Leible | null | undefined): boolean {
  try { return almacen?.getItem(CLAVE_SONIDOS_TENTI) !== '0'; } catch { return true; }
}

// Lo que se pidió en esta pestaña, por si el almacenamiento no deja escribir.
let enMemoria: boolean | null = null;

function almacen(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; }
}

/** Si Tenti puede sonar en este dispositivo. */
export function sonidosDeTentiActivos(): boolean {
  if (typeof window === 'undefined') return false;
  return enMemoria ?? sonidosGuardados(almacen());
}

export function ponerSonidosDeTenti(v: boolean): void {
  enMemoria = v;
  try { almacen()?.setItem(CLAVE_SONIDOS_TENTI, v ? '1' : '0'); } catch { /* dura lo que la pestaña */ }
  if (v) prepararSonidos();
  window.dispatchEvent(new Event(EVENTO));
}

function suscribir(avisar: () => void): () => void {
  const enOtraPestana = (e: StorageEvent) => {
    if (e.key !== CLAVE_SONIDOS_TENTI) return;
    enMemoria = null;
    avisar();
  };
  window.addEventListener(EVENTO, avisar);
  window.addEventListener('storage', enOtraPestana);
  return () => { window.removeEventListener(EVENTO, avisar); window.removeEventListener('storage', enOtraPestana); };
}

/** La preferencia, viva. En el servidor, encendido (lo de por defecto). */
export function useSonidosDeTenti(): boolean {
  return useSyncExternalStore(suscribir, sonidosDeTentiActivos, () => true);
}

let modulo: typeof import('./sonidos.ts') | null = null;
let pidiendo: Promise<typeof import('./sonidos.ts') | null> | null = null;
let escuchandoGesto = false;

function cargar(): Promise<typeof import('./sonidos.ts') | null> {
  return (pidiendo ??= import('./sonidos.ts').then(
    (m) => (modulo = m),
    () => { pidiendo = null; return null; },
  ));
}

/**
 * Trae la síntesis y deja preparado el primer gesto (clic o tecla) para
 * despertar el audio: el navegador no deja sonar antes, y Safari tampoco
 * después si el audio no se despertó dentro de un gesto. Lo llama cada Tenti al
 * montarse con el sonido encendido; con él apagado no se descarga nada.
 */
export function prepararSonidos(): void {
  if (typeof window === 'undefined' || !sonidosDeTentiActivos()) return;
  void cargar();
  if (escuchandoGesto) return;
  escuchandoGesto = true;
  const alGesto = () => {
    if (!sonidosDeTentiActivos()) return;
    if (!modulo) return; // aún no ha llegado: lo intentará el siguiente gesto
    modulo.desbloquear();
    window.removeEventListener('pointerdown', alGesto, true);
    window.removeEventListener('keydown', alGesto, true);
  };
  window.addEventListener('pointerdown', alGesto, true);
  window.addEventListener('keydown', alGesto, true);
}

/** Suena `n` si los sonidos de Tenti están encendidos en este dispositivo. */
export function sonarTenti(n: Sonido): void {
  if (!sonidosDeTentiActivos()) return;
  if (modulo) { modulo.sonar(n); return; }
  void cargar().then((m) => { if (m && sonidosDeTentiActivos()) m.sonar(n); });
}
