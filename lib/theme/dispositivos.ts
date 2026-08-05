// Los dispositivos del preview del editor, y el cálculo de cuánto hay que
// encoger cada uno para que quepa.
//
// ⚠️ El motivo de que esto exista en vez de un `max-width` y ya está: un
// iframe con 660 px de ancho **renderiza como un móvil de 660 px**, no como
// una tablet encogida. Los media queries del portal miran el ancho real del
// iframe, no lo que ponga en la etiqueta del botón. Un marco que dijera
// "tablet" mientras renderiza 660 sería una mentira del mismo tipo que el
// `320px` que este mismo editor tuvo durante meses.
//
// Por eso el iframe se declara SIEMPRE al ancho real del dispositivo y luego
// se encoge con `transform: scale()`. El contenido de dentro sigue creyendo
// que tiene 768 px, que es lo que hace falta para que la vista previa diga la
// verdad.

export const DISPOSITIVOS = {
  movil: { etiqueta: 'Móvil', ancho: 390, alto: 844, conMarco: true },
  tablet: { etiqueta: 'Tablet', ancho: 768, alto: 1024, conMarco: true },
  // "Ancho completo" y NO "Escritorio": el portal no tiene una maquetación de
  // escritorio: es la misma app estirada. Llamarlo escritorio prometería algo
  // que no existe.
  completo: { etiqueta: 'Ancho completo', ancho: null, alto: null, conMarco: false },
} as const;

export type DispositivoId = keyof typeof DISPOSITIVOS;
export const DISPOSITIVO_IDS = Object.keys(DISPOSITIVOS) as DispositivoId[];

/**
 * Cuánto encoger para que `ancho` quepa en `disponible`.
 *
 * Nunca AGRANDA (tope en 1): un móvil de 390 px en una columna de 900 no debe
 * verse a tamaño gigante, porque entonces deja de parecerse a un móvil. Solo
 * se encoge cuando no cabe.
 */
export function escalaParaCaber(disponible: number, ancho: number): number {
  // Un contenedor todavía sin medir (0, o el `undefined` que dan algunos
  // observers en el primer tick) no debe colapsar el preview a nada.
  if (!Number.isFinite(disponible) || disponible <= 0) return 1;
  if (!Number.isFinite(ancho) || ancho <= 0) return 1;
  return Math.min(1, disponible / ancho);
}

/**
 * El alto que ocupa DE VERDAD en la página un marco escalado.
 *
 * `transform: scale()` no cambia el hueco que el elemento reserva en el
 * layout, así que sin esto un marco encogido dejaría un vacío enorme debajo —
 * y uno agrandado se comería lo de al lado. Se aplica como `height` al
 * contenedor.
 */
export function altoOcupado(alto: number, escala: number): number {
  return Math.round(alto * escala);
}
