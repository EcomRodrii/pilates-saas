// A qué ancho se pinta la vista previa del constructor de widgets y a qué
// escala, sin React (node --test). La vista previa NUNCA es una imagen: es la
// página de reservas de verdad pintada al ancho REAL del dispositivo y escalada
// para caber en su columna. Lo que decide este fichero es ese ancho y esa escala.
//
// Dos medidas:
//  · 'v1' — la de siempre (el constructor de antes). Una web de ordenador de
//    1200 px, o una ventana más justa alrededor de un widget estrecho, escalada
//    a lo que quepa: medido el 16-oct, 0,34–0,54 en la columna, y la letra de
//    15 px salía a 5–8 px. Se queda tal cual mientras viva la v1.
//  · 'legible' — «Tu web» v2 (decisión 6 de la propuesta aprobada): el móvil a
//    tamaño de verdad y el ordenador a una escala que se lee, nunca por debajo
//    de `ESCALA_LEGIBLE`. Para que quepa a esa escala, la ventana de ordenador
//    se estrecha (como mucho a 600 px): se ve el diseño de una ventana estrecha
//    de ordenador y la pantalla lo dice; «Ver a tamaño real» enseña el de 1200.
//  · 'real' — «Ver a tamaño real»: la web de 1200 (o el móvil de 390) entera,
//    a 1 si cabe.

export type Dispositivo = 'escritorio' | 'movil';
export type MedidasPrevia = 'v1' | 'legible' | 'real';

export const ANCHO_MOVIL = 390;
export const ANCHO_ESCRITORIO = 1200;
/** Por debajo de esto, la letra de 15 px del widget baja de 11 px: no se lee. */
export const ESCALA_LEGIBLE = 0.75;
/** La ventana de ordenador más estrecha que se dibuja: más estrecha ya sería un móvil. */
export const ANCHO_ESCRITORIO_MINIMO = 600;

/**
 * El ancho de la web dibujada en la medida de siempre ('v1'). En «Ordenador»,
 * con un widget en una columna (480) o una ventana encima (~720), una web de
 * 1200 escalada a la columna de la previa lo dejaba en ~210 px: ilegible, y casi
 * igual que el móvil (medido el 29-sep-2026, «no se diferencia entre ordenador y
 * móvil» y «un marco blanco al lado»). Alrededor de un widget estrecho se dibuja
 * una ventana más justa —sigue siendo una web de ordenador, con el widget en
 * medio y aire a los lados—; a todo el ancho, la de siempre.
 */
export function anchoLienzo(d: Dispositivo, anchoWidget: number | null): number {
  if (d === 'movil') return ANCHO_MOVIL;
  return anchoWidget ? Math.min(ANCHO_ESCRITORIO, Math.max(760, anchoWidget + 280)) : ANCHO_ESCRITORIO;
}

export interface Medidas {
  /** El ancho de verdad al que se pinta la página (px CSS dentro del iframe). */
  ancho: number;
  /** La escala con que se enseña en la columna. */
  escala: number;
  /**
   * La página escalada no cabe a lo ancho (solo en 'legible', con una columna
   * de menos de 450 px): se deja desplazar de lado antes que bajar de la escala
   * que se lee.
   */
  desborda: boolean;
}

/**
 * `disponible`: lo que mide por dentro la columna de la vista previa (0 mientras
 * no se ha medido: entonces, a 1, como hasta ahora).
 */
export function medidasLienzo(
  d: Dispositivo,
  anchoWidget: number | null,
  disponible: number,
  medidas: MedidasPrevia = 'v1',
): Medidas {
  const ajustar = (ancho: number, minima = 0): Medidas => {
    if (disponible <= 0) return { ancho, escala: 1, desborda: false };
    const escala = Math.min(1, Math.max(minima, disponible / ancho));
    return { ancho, escala, desborda: ancho * escala > disponible + 0.5 };
  };
  if (medidas === 'v1') return ajustar(anchoLienzo(d, anchoWidget));
  if (d === 'movil') return ajustar(ANCHO_MOVIL);
  if (medidas === 'real') return ajustar(ANCHO_ESCRITORIO);
  // La ventana más ancha que cabe a la escala que se lee, entre 600 y 1200. El
  // widget va centrado y con su ancho máximo dentro, así que no hace falta
  // ensancharla por él: si la ventana es más estrecha que el widget, el widget
  // ocupa la ventana, como en una ventana estrecha de verdad.
  const cabe = disponible > 0 ? Math.floor(disponible / ESCALA_LEGIBLE) : ANCHO_ESCRITORIO;
  const ancho = Math.min(ANCHO_ESCRITORIO, Math.max(ANCHO_ESCRITORIO_MINIMO, cabe));
  return ajustar(ancho, ESCALA_LEGIBLE);
}
