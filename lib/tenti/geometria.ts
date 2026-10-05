// ─────────────────────────────────────────────────────────────────────────────
// Tenti — la geometría del dibujo. Una sola, para el canvas y para el icono.
//
// Portado del prototipo web de Coucou (design/prototype/notch-buddy.html),
// cuyo personaje Tentare usa con autorización escrita de su autor (5-oct-2026).
// El código de Coucou es MIT:
//
//   Copyright (c) 2026 Louis Raillé
//   Permission is hereby granted, free of charge, to any person obtaining a copy
//   of this software and associated documentation files (the "Software"), to deal
//   in the Software without restriction, including without limitation the rights
//   to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
//   copies of the Software, and to permit persons to whom the Software is
//   furnished to do so, subject to the following conditions: The above copyright
//   notice and this permission notice shall be included in all copies or
//   substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS",
//   WITHOUT WARRANTY OF ANY KIND.
//
// Tenti se pinta de dos maneras: el motor (./motor.ts) lo anima en un <canvas>
// en las primeras veces, y TentiIcono (components/tenti/tenti-icono.tsx) lo
// pinta quieto, en SVG y a tamaño de icono, en lo diario. Si cada uno llevara
// sus números, al primer retoque habría dos Tentis que solo se parecen. Por eso
// todo lo que define el dibujo —el contorno, dónde van los ojos y los mofletes,
// la luz y el volumen— vive aquí y los dos lo leen. geometria.test.ts comprueba
// que el motor no vuelve a llevar sus propios números.
//
// Sin DOM: lo prueba node --test, y el icono no arrastra el motor (ni su chunk)
// por importar esto.
// ─────────────────────────────────────────────────────────────────────────────

/** R, la medida de la que sale todo, en proporción al lado del cuadro. */
export const R_DEL_LADO = 0.3;
/** Semiejes del cuerpo, en proporción a R: más ancho que alto. */
export const SEMIEJE_X = 1.14;
export const SEMIEJE_Y = 0.88;
/** El cuerpo baja un poco del centro del cuadro, en proporción a R. */
export const BAJADA = 0.06;
/** Superelipse |x/rx|ⁿ + |y/ry|ⁿ = 1: entre la elipse (2) y el rectángulo. */
export const EXPONENTE = 2.7;
/** Tramos del contorno: 72 tramos son 73 puntos, y el último vuelve al primero. */
export const TRAMOS = 72;

/** Dónde van los ojos en el cuerpo (la «pista mochi» del prototipo): ancho y
 *  alto en R, y separación y altura como ángulos sobre una esfera. */
export const OJO = { w: 0.25, h: 0.27, sp: 0.37, p: -0.12 } as const;

/** Los mofletes: centro en rx/ry, radios en R. Nunca bajan de `minimo`: un
 *  Tenti sin rubor parece otro. Con la cabeza girada se desplazan `giro`·rx. */
export const MOFLETE = { x: 0.55, y: 0.2, rx: 0.17, ry: 0.1, minimo: 0.35, opacidad: 0.5, giro: 0.8 } as const;

/** Luz y volumen, en rx/ry (posiciones) y en R (radios). El cuerpo va de la
 *  luz, arriba a la derecha, a la sombra; encima, un volumen que oscurece el
 *  borde de abajo a la izquierda y un brillo arriba a la derecha. */
export const LUZ = {
  degradado: { desde: [0.7, -0.85], hasta: [-0.8, 0.9] },
  volumen: { foco: [0.25, -0.32], radioFoco: 0.15, radio: 1.25, desde: 0.6, opacidad: 0.2 },
  brillo: { centro: [0.34, -0.46], radio: 0.42, opacidad: 0.55 },
} as const;

/**
 * El grosor de la silueta del icono, en px de PANTALLA (va con
 * vector-effect="non-scaling-stroke"). La silueta va por DENTRO del cuerpo, así
 * que no se sale de un viewBox ceñido. Existe porque en claro el cuerpo crema
 * da 1,04:1 sobre --card: sin ella, a 18 px Tenti son dos ojos flotando. El
 * canvas de las primeras veces no la lleva (a 80 px el volumen basta); si algún
 * día la lleva, que lea esta constante: una sola decisión de silueta.
 */
export const SILUETA_PX = 1;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export interface MedidasCuerpo { R: number; rx: number; ry: number }

/** Las medidas del cuerpo en un cuadro de `lado` (px de canvas o unidades de SVG). */
export function medidas(lado: number): MedidasCuerpo {
  const R = lado * R_DEL_LADO;
  return { R, rx: R * SEMIEJE_X, ry: R * SEMIEJE_Y };
}

/**
 * Recorre los TRAMOS + 1 puntos del contorno, alrededor de (0, 0). Sin crear
 * arrays: el motor lo llama en cada fotograma.
 */
export function recorrerContorno(rx: number, ry: number, punto: (x: number, y: number, i: number) => void): void {
  for (let i = 0; i <= TRAMOS; i++) {
    const a = i / TRAMOS * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    punto(rx * Math.sign(ca) * Math.pow(Math.abs(ca), 2 / EXPONENTE), ry * Math.sign(sa) * Math.pow(Math.abs(sa), 2 / EXPONENTE), i);
  }
}

/** El contorno como lista de puntos [x, y], alrededor de (0, 0). */
export function contorno(rx: number, ry: number): [number, number][] {
  const puntos: [number, number][] = [];
  recorrerContorno(rx, ry, (x, y) => { puntos.push([x, y]); });
  return puntos;
}

export interface OjoColocado {
  /** Centro del ojo respecto al centro del cuerpo. */
  x: number; y: number;
  /** Cuánto se estrecha al girar (los ojos van sobre una esfera). */
  escalaX: number; escalaY: number;
}

/**
 * Dónde cae un ojo (`lado` -1 el izquierdo, 1 el derecho) con la cabeza girada
 * `yaw` y `pitch` (radianes), o null si queda de espaldas. `morph` (0…1) es el
 * cuerpo cuadrado del prototipo y `vuelta` el giro entero de 'hecho' (los ojos
 * dan la vuelta con el cuerpo). Con la cabeza al frente (0, 0) es la pose del
 * icono, y la de reposo del canvas.
 */
export function colocarOjo(lado: -1 | 1, yaw: number, pitch: number, rx: number, ry: number, morph = 0, vuelta = 0): OjoColocado | null {
  const giro = lado * OJO.sp + yaw;
  let p = OJO.p + pitch + vuelta;
  p = ((p + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  const cp = Math.cos(p);
  if (Math.cos(giro) * cp < 0.04) return null;
  let y = -Math.sin(p) * ry;
  if (morph > 0) y += ry * 0.14 * morph;
  return {
    x: Math.sin(giro) * cp * rx, y,
    escalaX: lerp(Math.max(0.18, Math.cos(giro)), 1, morph * 0.7),
    escalaY: lerp(Math.max(0.18, cp), 1, morph * 0.7),
  };
}

/** El ojo de siempre, una píldora de `ancho`×`alto` que al cerrarse no baja de
 *  un 30 % del ancho (un parpadeo no la convierte en una raya invisible). */
export function pildora(ancho: number, alto: number, abierto: number): { ancho: number; alto: number; radio: number } {
  const a = Math.max(alto * abierto, ancho * 0.3);
  return { ancho, alto: a, radio: Math.min(ancho / 2, a / 2) };
}

// ── El icono ─────────────────────────────────────────────────────────────────

/** El icono se dibuja en un cuadro de 100, como el canvas en su lado. */
export const LADO_ICONO = 100;

export interface DibujoIcono {
  /** Ceñido al cuerpo: así el `ancho` del icono mide a Tenti, no aire. */
  viewBox: string;
  caja: { x: number; y: number; ancho: number; alto: number };
  /** alto ÷ ancho. */
  proporcion: number;
  /** El `d` del contorno. */
  cuerpo: string;
  degradado: { x1: number; y1: number; x2: number; y2: number };
  volumen: { cx: number; cy: number; r: number; fx: number; fy: number; fr: number; desde: number; opacidad: number };
  brillo: { cx: number; cy: number; r: number; opacidad: number };
  mofletes: { cx: number; cy: number; rx: number; ry: number }[];
  opacidadMofletes: number;
  ojos: { x: number; y: number; ancho: number; alto: number; rx: number; ry: number }[];
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Tenti en reposo, tal cual lo pinta el canvas en su primer fotograma quieto:
 * la cabeza al frente, los ojos abiertos, los mofletes al mínimo y sin tinte.
 * No recibe estado a propósito: 'pensando' es esta misma pose respirando (por
 * CSS), nunca la del canvas, que mira arriba a la derecha como un asistente que
 * piensa —eso se queda en /interno—.
 */
export function dibujoDelIcono(): DibujoIcono {
  const { R, rx, ry } = medidas(LADO_ICONO);
  const cx = LADO_ICONO / 2, cy = LADO_ICONO / 2 + R * BAJADA;
  const caja = { x: r3(cx - rx), y: r3(cy - ry), ancho: r3(2 * rx), alto: r3(2 * ry) };

  const tramos: string[] = [];
  recorrerContorno(rx, ry, (x, y, i) => { tramos.push(`${i ? 'L' : 'M'}${r3(cx + x)} ${r3(cy + y)}`); });

  const { degradado: dg, volumen: vo, brillo: br } = LUZ;
  const w = R * OJO.w;
  const pil = pildora(w, R * OJO.h, 1);
  const ojos = ([-1, 1] as const).map((lado) => {
    // Al frente nunca queda de espaldas: el `!` lo vigila el test.
    const o = colocarOjo(lado, 0, 0, rx, ry)!;
    const ancho = pil.ancho * o.escalaX, alto = pil.alto * o.escalaY;
    return {
      x: r3(cx + o.x - ancho / 2), y: r3(cy + o.y - alto / 2), ancho: r3(ancho), alto: r3(alto),
      rx: r3(pil.radio * o.escalaX), ry: r3(pil.radio * o.escalaY),
    };
  });

  return {
    viewBox: `${caja.x} ${caja.y} ${caja.ancho} ${caja.alto}`,
    caja,
    proporcion: caja.alto / caja.ancho,
    cuerpo: `${tramos.join('')}Z`,
    degradado: {
      x1: r3(cx + rx * dg.desde[0]), y1: r3(cy + ry * dg.desde[1]),
      x2: r3(cx + rx * dg.hasta[0]), y2: r3(cy + ry * dg.hasta[1]),
    },
    volumen: {
      cx: r3(cx), cy: r3(cy), r: r3(R * vo.radio),
      fx: r3(cx + rx * vo.foco[0]), fy: r3(cy + ry * vo.foco[1]), fr: r3(R * vo.radioFoco),
      desde: vo.desde, opacidad: vo.opacidad,
    },
    brillo: { cx: r3(cx + rx * br.centro[0]), cy: r3(cy + ry * br.centro[1]), r: r3(R * br.radio), opacidad: br.opacidad },
    mofletes: ([-1, 1] as const).map((lado) => ({
      cx: r3(cx + lado * rx * MOFLETE.x), cy: r3(cy + ry * MOFLETE.y), rx: r3(R * MOFLETE.rx), ry: r3(R * MOFLETE.ry),
    })),
    opacidadMofletes: MOFLETE.opacidad * MOFLETE.minimo,
    ojos,
  };
}

// ── El lienzo, con traje ─────────────────────────────────────────────────────
//
// Los trajes son los de Coucou (./trajes-coucou.ts), y no caben en el cuadro
// del cuerpo: el gorro de fiesta sube 2,4 R por encima del centro y el lienzo
// sin traje acaba a 1,73 R; el ala de la bruja y la punta del de Papá Noel se
// salen por los lados. Coucou dibuja el cuerpo pequeño en su lienzo (la hoja
// usa el 62 %); aquí el CUERPO tiene que seguir midiendo lo mismo (el icono
// mide el cuerpo, y la pantalla no se mueve un píxel), así que con traje el
// lienzo crece hacia fuera y se sale de su caja con márgenes negativos
// (components/tenti/tenti.tsx). Lo mide trajes-coucou.test.ts con TODOS los
// trajes, en todas las poses, aplastado y botando.

/** El aire de más con traje, en proporción al lado del cuadro del cuerpo. */
export const MARGEN_TRAJE = { arriba: 0.38, lado: 0.13, abajo: 0.03 } as const;

export interface LienzoTenti {
  /** Tamaño del lienzo, en las unidades de `lado`. */
  ancho: number; alto: number;
  /** Dónde empieza el cuadro del cuerpo dentro del lienzo (= el margen negativo). */
  izquierda: number; arriba: number;
}

/** El lienzo de un Tenti cuyo cuadro mide `lado`: sin traje, el cuadro; con traje, más. */
export function lienzoDeTenti(lado: number, conTraje: boolean): LienzoTenti {
  if (!conTraje) return { ancho: lado, alto: lado, izquierda: 0, arriba: 0 };
  const m = MARGEN_TRAJE;
  return {
    ancho: lado * (1 + 2 * m.lado), alto: lado * (1 + m.arriba + m.abajo),
    izquierda: lado * m.lado, arriba: lado * m.arriba,
  };
}
