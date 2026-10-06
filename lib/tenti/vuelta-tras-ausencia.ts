// Cuántas veces se ha vuelto a esta pestaña tras un buen rato fuera
// (`AUSENCIA_BOSTEZO_MS`, lib/tenti/momentos.ts): el bostezo de Tenti en la
// tira de Hoy («has estado fuera un buen rato»).
//
// Un contador de módulo y `useSyncExternalStore`: el snapshot es un número que
// solo cambia al volver, así que no hay bucle por milisegundos (memoria
// «getSnapshot Date.now») ni un setState dentro de un efecto. Quien lo usa
// compara con el valor que tenía al montarse: una vuelta de antes de que se
// pintara no es suya.

import { useSyncExternalStore } from 'react';
import { AUSENCIA_BOSTEZO_MS } from './momentos.ts';

let vueltas = 0;
let ocultaDesde: number | null = null;
const avisos = new Set<() => void>();

function alCambiar() {
  if (document.hidden) { ocultaDesde = performance.now(); return; }
  const fuera = ocultaDesde == null ? 0 : performance.now() - ocultaDesde;
  ocultaDesde = null;
  if (fuera < AUSENCIA_BOSTEZO_MS) return;
  vueltas++;
  for (const a of avisos) a();
}

function suscribir(avisar: () => void): () => void {
  if (avisos.size === 0) {
    if (document.hidden) ocultaDesde = performance.now();
    document.addEventListener('visibilitychange', alCambiar);
  }
  avisos.add(avisar);
  return () => {
    avisos.delete(avisar);
    if (avisos.size === 0) document.removeEventListener('visibilitychange', alCambiar);
  };
}

/** Las vueltas tras una ausencia larga desde que se abrió la pestaña. En el servidor, 0. */
export function useVueltaTrasAusencia(): number {
  return useSyncExternalStore(suscribir, () => vueltas, () => 0);
}
