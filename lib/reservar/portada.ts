// La cabecera y la portada de la página suelta /reservar/[slug] (F3 del
// rediseño «/reservar = estilo de la app de la alumna», 29-sep-2026).
//
// Lo que se decide aquí, y por qué vive en un fichero puro con su test:
//
//   · Las MEDIDAS que comparten la cabecera, la portada y el horario, para que
//     los tres bordes se alineen sin copiar números a mano en tres sitios.
//   · La TINTA y el VELO de lo que va encima de la foto. Es la única parte de
//     la página con colores fijos, y es a propósito: la foto es la foto en los
//     ocho estilos de la app —no se vuelve oscura con «Carbón» ni clara con
//     «Luz»—, así que lo que se lee encima tampoco puede cambiar con el estilo.
//     Es el mismo criterio que la app de la alumna con su `--on-dark`. Todo lo
//     que NO va sobre la foto (la cabecera sin portada, el menú, el horario)
//     sigue con los tokens `--portal-*`.
//
// ⚠️ El contraste sobre una foto no lo puede medir un test de navegador: el
// medidor de e2e/reservar-tema-de-la-app.spec.ts se salta a propósito lo que
// tiene una imagen detrás. Por eso se garantiza aquí, contra el PEOR píxel
// posible (blanco puro bajo el velo): si el velo aguanta eso, aguanta la foto
// que suba cualquier estudio. Lo comprueba ./portada.test.ts.

import { hexARgb } from '../wcag-contrast.ts';

/**
 * Ancho de la columna del horario en escritorio. Decisión del fundador
 * (27-sep-2026): «el horario va en una columna contenida (~720 px), no a todo
 * el ancho» — revoca la petición de #1240 de filas a ancho completo. La ficha
 * de una clase vive dentro de la misma columna, así que abrirla no salta de
 * ancho.
 */
export const COLUMNA_HORARIO = 720;

/**
 * Ancho del contenedor de la página: el de las pestañas, los bonos y el pie de
 * siempre. La cabecera va a este ancho y no al de la columna para que su borde
 * izquierdo sea el de todas las demás secciones de la página.
 */
export const ANCHO_PAGINA = 1280;

/** El texto sobre la foto. El crema de la app, no el blanco puro: sobre una foto cálida el blanco se ve azulado. */
export const TINTA_SOBRE_FOTO = '#FAF9F5';

/**
 * El texto secundario sobre la foto (la ciudad). La jerarquía la marcan el
 * tamaño y las versales, no la opacidad: con .86 —lo que pedía el ojo— ya no
 * llegaba a 4,5:1 sobre el tramo más claro del velo.
 */
export const TINTA_SUAVE_SOBRE_FOTO = 'rgba(250,249,245,.92)';

/**
 * El texto de lo que va RELLENO de crema sobre la foto (el botón «Ver el
 * horario», el numerito de «Mis reservas»): la tinta de día de /reservar.
 */
export const TINTA_SOBRE_CREMA = '#1A1A1A';

/** El tinte de los botones «de cristal» sobre la foto (Acceder, menú, Mis reservas). */
export const CRISTAL_SOBRE_FOTO = 'rgba(8,8,8,.32)';
/** Su borde: lo que los separa de la foto cuando la foto es oscura. */
export const BORDE_CRISTAL_SOBRE_FOTO = 'rgba(250,249,245,.5)';

/**
 * Lo que se ve si la foto no llega a cargar (o mientras carga). Sin tinta
 * detrás, el velo se pinta sobre el fondo de la página y en «Crema» o «Luz»
 * el texto crema quedaría sobre casi blanco.
 */
export const FONDO_SIN_FOTO = '#0F0F0C';

/** El negro del velo, el mismo de la app de la alumna. */
const NEGRO_VELO = [8, 8, 8] as const;

/**
 * Las paradas del velo, de arriba abajo: `[posición %, opacidad]`.
 *
 * Más denso arriba (la cabecera) y abajo (el subtítulo y el botón) que en
 * medio, donde va el titular —texto grande, que se conforma con 3:1—. Pero
 * ninguna parada baja de `VELO_MINIMO`: entre dos paradas el navegador
 * interpola en línea recta, así que el tramo más claro del velo es la parada
 * más clara, y con eso cualquier texto pequeño pasa AA caiga donde caiga. No
 * depende de cuánto mida la portada en cada pantalla.
 */
export const PARADAS_VELO: readonly (readonly [posicion: number, alfa: number])[] = [
  [0, 0.68],
  [40, 0.6],
  [62, 0.6],
  [100, 0.74],
];

/** La opacidad del tramo más claro del velo. */
export const VELO_MINIMO = Math.min(...PARADAS_VELO.map(([, a]) => a));

/** El velo como `background` de CSS. */
export function veloPortadaCss(): string {
  const [r, g, b] = NEGRO_VELO;
  return `linear-gradient(180deg, ${PARADAS_VELO.map(([p, a]) => `rgba(${r},${g},${b},${a}) ${p}%`).join(', ')})`;
}

/** Mezcla un color sobre otro con una opacidad dada (composición «normal»). */
function mezclar(arriba: readonly [number, number, number], alfa: number, abajo: readonly [number, number, number]): [number, number, number] {
  return [0, 1, 2].map(i => Math.round(arriba[i] * alfa + abajo[i] * (1 - alfa))) as [number, number, number];
}

function aHex([r, g, b]: readonly [number, number, number]): string {
  return `#${[r, g, b].map(c => c.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * El fondo MÁS CLARO que puede quedar bajo un velo de esta opacidad: un píxel
 * blanco puro de la foto (una pared a contraluz), con el velo encima. Si
 * `capaExtra` se da, se apila otra capa translúcida (el cristal de un botón).
 */
export function peorFondoBajoVelo(alfa: number, capaExtra?: { color: string; alfa: number }): string {
  let fondo = mezclar(NEGRO_VELO, alfa, [255, 255, 255]);
  if (capaExtra) {
    const c = hexARgb(capaExtra.color);
    if (c) fondo = mezclar([c.r, c.g, c.b], capaExtra.alfa, fondo);
  }
  return aHex(fondo);
}

/** Un `rgba(r,g,b,a)` de este fichero como color opaco sobre `fondo`. Solo para los tests de contraste. */
export function componerSobre(rgba: string, fondo: string): string | null {
  const m = /^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/.exec(rgba.replace(/\s+/g, ''));
  const f = hexARgb(fondo);
  if (!m || !f) return null;
  return aHex(mezclar([Number(m[1]), Number(m[2]), Number(m[3])], Number(m[4]), [f.r, f.g, f.b]));
}
