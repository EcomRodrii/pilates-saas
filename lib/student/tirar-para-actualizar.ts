// La física de «tirar para actualizar». Pura y sin `@/`
// (tirar-para-actualizar.test.ts); el componente es
// components/student/ui/TirarParaActualizar.tsx.

/** Lo que hay que bajar el indicador (ya con resistencia) para que suelte y recargue. */
export const UMBRAL_PX = 56;
/** Lo más que baja el indicador, tire lo que tire. */
export const TOPE_PX = 96;

/**
 * El dedo baja `dedo` píxeles y el indicador baja menos, cada vez menos: la
 * misma sensación de goma que el de iOS. Casi lineal al principio y
 * acercándose al tope sin llegar a pasarlo.
 */
export function distanciaConResistencia(dedo: number): number {
  if (!(dedo > 0)) return 0;
  const d = dedo * 0.7;
  return TOPE_PX * (1 - Math.exp(-d / TOPE_PX));
}

/** ¿Al soltar, recarga? */
export function sueltaYRecarga(distancia: number): boolean {
  return distancia >= UMBRAL_PX;
}

/**
 * ¿Este gesto es tirar hacia abajo, o es otra cosa (pasar los días del horario
 * de lado, subir la lista)? Se decide con los primeros píxeles: si va más de
 * lado que hacia abajo, no es nuestro.
 */
export function esTironVertical(dx: number, dy: number): boolean {
  return dy > 0 && Math.abs(dy) > Math.abs(dx);
}
