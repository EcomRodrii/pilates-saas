// Cálculo de las ventanas de espera del motor de escalado. Puro y determinista
// (sin imports con alias) para poder testearlo con node --test. Lo consume
// lib/inngest/sustituciones.ts.

const MIN = 60_000;
export const VENTANA_MIN = 2 * MIN;    // suelo: clases muy cercanas escalan rápido
export const VENTANA_MAX = 45 * MIN;   // techo: nunca esperar más de 45 min

export interface Ventanas {
  correr: boolean;
  motivo?: 'clase_pasada';
  recordatorioMs: number;
  avanceMs: number;
}

/**
 * Ventanas de espera en función de lo que falta para la clase. Dos tramos de ~1/3
 * del tiempo restante, acotados a [2, 45] min, dejando ~1/3 de colchón antes de la
 * clase. El suelo bajo (2 min) es a propósito: una baja de última hora también
 * tiene que escalar (recordar → avanzar/alertar), solo que comprimido. Únicamente
 * se rinde si la clase YA empezó (nada que cubrir). Así, en modo autónomo, ni las
 * bajas de última hora ni un ranking que se agota cerca de la clase se quedan sin
 * alerta a la propietaria.
 */
export function calcularVentanas(msHastaClase: number): Ventanas {
  if (msHastaClase <= 0) return { correr: false, motivo: 'clase_pasada', recordatorioMs: 0, avanceMs: 0 };
  const tercio = Math.floor(msHastaClase / 3);
  const win = Math.min(VENTANA_MAX, Math.max(VENTANA_MIN, tercio));
  return { correr: true, recordatorioMs: win, avanceMs: win };
}
