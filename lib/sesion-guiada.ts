// Sesión guiada del portal: cronómetro de cliente sobre una lista fija de
// ejercicios, alcanzable tras reservar una clase (ver
// app/portal/[slug]/clases/[sesionId]/sesion-guiada/page.tsx). Sin vídeo, sin
// servidor, sin persistencia — no colisiona con el feature-freeze de VOD
// (lib/frozen-features.ts). Contenido FIJO a propósito, mismo criterio que
// lib/retos-portal.ts: configurabilidad por estudio es ampliación futura, no
// algo a anticipar sin que se pida.

export interface EjercicioSesionGuiada {
  nombre: string;
  segundos: number;
}

export const EJERCICIOS_SESION_GUIADA: readonly EjercicioSesionGuiada[] = [
  { nombre: 'Flexión lateral sentada', segundos: 50 },
  { nombre: 'Puente de hombros', segundos: 45 },
  { nombre: 'Cien clásico', segundos: 60 },
  { nombre: 'Estiramiento de columna', segundos: 40 },
];

/** ¿Es el último ejercicio de la lista? El botón "Siguiente" pasa a "Terminar". */
export function esUltimoEjercicio(indice: number): boolean {
  return indice >= EJERCICIOS_SESION_GUIADA.length - 1;
}

/**
 * Índice del ejercicio al saltar `delta` posiciones (anterior=-1, siguiente=1),
 * acotado a los límites de la lista — nunca fuera de rango.
 */
export function saltarEjercicio(indice: number, delta: number): number {
  return Math.min(EJERCICIOS_SESION_GUIADA.length - 1, Math.max(0, indice + delta));
}

/** Progreso 0-100 del ejercicio actual, para la barra de cuenta atrás. */
export function progresoEjercicio(indice: number, segundosRestantes: number): number {
  const duracion = EJERCICIOS_SESION_GUIADA[indice].segundos;
  return 100 - (segundosRestantes / duracion) * 100;
}
