// Recorte del aire (transparente o de fondo liso) alrededor de un logo, y el
// encaje del icono del estudio.
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

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Cuánto puede separarse un canal del color de fondo y seguir siendo fondo.
 *  Da margen al ruido de un JPG y a los bordes suavizados del dibujo. */
export const TOLERANCIA_FONDO = 24;

/** Parte del borde que tiene que ser de ese color para llamarlo «fondo liso». */
const BORDE_UNIFORME = 0.97;

/**
 * El color de fondo si el lienzo lo tiene LISO y opaco, o `null`.
 *
 * Por qué hace falta: un logo exportado sin transparencia (fondo crema,
 * blanco…) no tiene píxeles transparentes que recortar, así que el recorte por
 * alfa no hacía nada con él. Medido en producción: 1254×1254 de lienzo crema con
 * el dibujo flotando en el centro; a 40 px de alto la figura quedaba en 15.
 *
 * Solo se da por fondo si el borde entero (sus cuatro lados) es de un mismo
 * color: una foto o un logo que llega al borde no tiene un «fondo» que quitar.
 */
export function fondoLiso(
  rgba: Uint8ClampedArray | number[],
  ancho: number,
  alto: number,
  tolerancia: number = TOLERANCIA_FONDO,
): Rgb | null {
  if (ancho < 3 || alto < 3) return null;
  const borde: number[] = [];
  const tomar = (x: number, y: number) => borde.push((y * ancho + x) * 4);
  for (let x = 0; x < ancho; x++) { tomar(x, 0); tomar(x, alto - 1); }
  for (let y = 1; y < alto - 1; y++) { tomar(0, y); tomar(ancho - 1, y); }

  // Un borde transparente ya lo resuelve el recorte por alfa.
  const opacos = borde.filter(i => rgba[i + 3] > 255 - UMBRAL_ALFA);
  if (opacos.length < borde.length * BORDE_UNIFORME) return null;

  const mediana = (canal: number) => {
    const v = opacos.map(i => rgba[i + canal]).sort((a, b) => a - b);
    return v[v.length >> 1];
  };
  const fondo = { r: mediana(0), g: mediana(1), b: mediana(2) };
  const iguales = opacos.filter(i => esFondo(rgba, i, fondo, tolerancia)).length;
  return iguales >= borde.length * BORDE_UNIFORME ? fondo : null;
}

function esFondo(rgba: Uint8ClampedArray | number[], i: number, fondo: Rgb, tolerancia: number): boolean {
  return Math.abs(rgba[i] - fondo.r) <= tolerancia
    && Math.abs(rgba[i + 1] - fondo.g) <= tolerancia
    && Math.abs(rgba[i + 2] - fondo.b) <= tolerancia;
}

/**
 * Caja del dibujo dentro de un buffer RGBA. `null` si no hay dibujo (no hay
 * nada que recortar y recortar a cero rompería la imagen).
 *
 * Sin `fondo`, dibujo = lo que no es transparente. Con `fondo` (ver
 * `fondoLiso`), tampoco cuenta lo que es de ese color.
 */
export function calcularCajaOpaca(
  rgba: Uint8ClampedArray | number[],
  ancho: number,
  alto: number,
  umbral: number = UMBRAL_ALFA,
  fondo: Rgb | null = null,
): CajaOpaca | null {
  let x0 = ancho, y0 = alto, x1 = -1, y1 = -1;

  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const i = (y * ancho + x) * 4;
      if (rgba[i + 3] <= umbral) continue;
      if (fondo && esFondo(rgba, i, fondo, TOLERANCIA_FONDO)) continue;
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

// ── El icono del estudio ────────────────────────────────────────────────────
//
// El favicon que sube el estudio se guarda ya preparado para verse pequeño: el
// símbolo, sin márgenes propios, centrado en un cuadrado blanco y ocupando casi
// todo el lienzo. Se guarda a `LADO_ICONO` y no a 64 para que el mismo símbolo
// sirva nítido a 180/192/512 (icono de la app instalada) y en la cabecera en
// pantallas 3x; la pestaña recibe un PNG de 64×64 hecho a partir de él.

export const LADO_ICONO = 512;

/** Aire por lado, en fracción del lado. El símbolo ocupa el 84 % restante: a
 *  16 px son 13 px de dibujo, y no roza el borde redondeado de la pestaña. */
export const MARGEN_ICONO = 0.08;

export const FONDO_ICONO = '#FFFFFF';

/** Fondo de reserva cuando el símbolo es tan claro que en blanco desaparecería
 *  (un logo en blanco sobre transparente, muy habitual). */
export const FONDO_ICONO_OSCURO = '#1A1A1A';

/** Dónde va el dibujo (de `ancho`×`alto`) dentro del cuadrado de `lado`:
 *  centrado, sin deformar y con `margen` de aire por lado. */
export function encajeCentrado(ancho: number, alto: number, lado: number, margen: number = MARGEN_ICONO): CajaOpaca {
  const util = lado * (1 - 2 * margen);
  const escala = util / Math.max(ancho, alto);
  const w = Math.max(1, Math.round(ancho * escala));
  const h = Math.max(1, Math.round(alto * escala));
  return { x: Math.round((lado - w) / 2), y: Math.round((lado - h) / 2), ancho: w, alto: h };
}

/**
 * ¿El dibujo es demasiado claro para ir sobre blanco? Media de luminancia de
 * lo que es dibujo (ni transparente ni `fondo`), ponderada por su opacidad.
 */
export function tintaClara(
  rgba: Uint8ClampedArray | number[],
  ancho: number,
  alto: number,
  fondo: Rgb | null = null,
): boolean {
  let suma = 0, peso = 0;
  for (let i = 0; i < ancho * alto * 4; i += 4) {
    const a = rgba[i + 3];
    if (a <= UMBRAL_ALFA || (fondo && esFondo(rgba, i, fondo, TOLERANCIA_FONDO))) continue;
    suma += (0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2]) * a;
    peso += a;
  }
  return peso > 0 && suma / peso > 225;
}
