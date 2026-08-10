// Recorte del aire transparente alrededor de un logo.
//
// Por qué existe: el logo del estudio se pinta en los correos con una altura
// fija (`<Img height="32">`). Si el PNG que subió trae el dibujo flotando en un
// lienzo holgado, esa altura la consume el aire y no la tinta — un logo real
// medido en producción tenía 1508×1043 de lienzo con 1451×297 de dibujo, así
// que a 32 px de alto solo 9 eran logo. No se nota al subirlo (el editor lo
// enseña grande) y sí en la bandeja de la clienta.
//
// Esta parte es pura a propósito: recibe los píxeles ya decodificados, así que
// se puede probar sin navegador. El trabajo con canvas vive aparte.

export interface CajaOpaca {
  x: number;
  y: number;
  ancho: number;
  alto: number;
}

/** Un píxel cuenta como dibujo a partir de aquí. No es 0 porque los bordes
 *  suavizados de un PNG dejan un halo de alfa muy baja que, si se cuenta,
 *  devuelve el lienzo entero y el recorte no hace nada. */
export const UMBRAL_ALFA = 12;

/**
 * Caja del dibujo dentro de un buffer RGBA. `null` si es transparente entero
 * (no hay nada que recortar y recortar a cero rompería la imagen).
 */
export function calcularCajaOpaca(
  rgba: Uint8ClampedArray | number[],
  ancho: number,
  alto: number,
  umbral: number = UMBRAL_ALFA,
): CajaOpaca | null {
  let x0 = ancho, y0 = alto, x1 = -1, y1 = -1;

  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      if (rgba[(y * ancho + x) * 4 + 3] <= umbral) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }

  if (x1 < 0) return null;
  return { x: x0, y: y0, ancho: x1 - x0 + 1, alto: y1 - y0 + 1 };
}

/** A partir de cuánto compensa recortar. Por debajo, el recorte solo cambiaría
 *  el fichero para nada: reescribir el PNG de un logo que ya venía ceñido es
 *  arriesgar una recodificación a cambio de un par de píxeles. */
export const MARGEN_TOLERADO = 0.04;

/**
 * ¿Merece la pena recortar? Compara el área del dibujo con la del lienzo.
 * Se mide por lado y no por área total: un logo apaisado dentro de un lienzo
 * cuadrado desperdicia el alto aunque el ancho esté aprovechado, y es justo el
 * alto lo que manda cuando el correo fija `height`.
 */
export function mereceRecorte(caja: CajaOpaca | null, ancho: number, alto: number): boolean {
  if (!caja) return false;
  const sobraAncho = 1 - caja.ancho / ancho;
  const sobraAlto = 1 - caja.alto / alto;
  return sobraAncho > MARGEN_TOLERADO || sobraAlto > MARGEN_TOLERADO;
}
