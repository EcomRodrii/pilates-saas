// Cálculo de las ventanas de espera del motor de escalado. Puro y determinista
// (sin imports con alias) para poder testearlo con node --test. Lo consume
// lib/inngest/sustituciones.ts.

const MIN = 60_000;
export const VENTANA_MIN = 5 * MIN;    // no molestar antes de 5 min tras el aviso
export const VENTANA_MAX = 45 * MIN;   // responsivo: nunca esperar más de 45 min
export const CLASE_MINIMA_MS = 8 * MIN; // < 8 min para la clase → sin línea temporal

export interface Ventanas {
  correr: boolean;
  motivo?: 'clase_inminente' | 'clase_pasada';
  recordatorioMs: number;
  avanceMs: number;
}

/**
 * Ventanas de espera en función de lo que falta para la clase. Dos tramos de ~1/3
 * del tiempo restante, acotados a [5, 45] min, con un colchón de ~1/3 antes de la
 * clase. Clases muy próximas (< 8 min) no arrancan la línea temporal: el email
 * inicial ya salió y no da tiempo a un ciclo de recordatorio + avance.
 */
export function calcularVentanas(msHastaClase: number): Ventanas {
  if (msHastaClase <= 0) return { correr: false, motivo: 'clase_pasada', recordatorioMs: 0, avanceMs: 0 };
  if (msHastaClase < CLASE_MINIMA_MS) return { correr: false, motivo: 'clase_inminente', recordatorioMs: 0, avanceMs: 0 };
  const tercio = Math.floor(msHastaClase / 3);
  const win = Math.min(VENTANA_MAX, Math.max(VENTANA_MIN, tercio));
  return { correr: true, recordatorioMs: win, avanceMs: win };
}
