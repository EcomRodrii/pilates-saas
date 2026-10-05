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

import type { Traje } from './trajes.ts';

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

// ── Los trajes: el gorro de bruja ────────────────────────────────────────────
//
// Como el cuerpo, un solo dibujo para el canvas (motor.ts, que lo anima) y para
// el SVG de reserva del icono (en la pose de reposo). Los dos trazan el cono con
// `trazarCono` y leen las mismas piezas: geometria.test.ts comprueba que el SVG
// sale de estas constantes y que el gorro cabe en el lienzo del canvas.

/**
 * El gorro, en R y con el centro del ala como origen (y hacia abajo, como el
 * canvas). Las curvas del cono son cuadráticas: M y luego [control, fin].
 */
export const GORRO_BRUJA = {
  /** Centro del ala respecto al centro del cuerpo, en ry (≈ -0,70 R). */
  alaY: -0.80,
  /** Elipse del ala, en R: el cuerpo mide 1,14 R de semieje. */
  ala: { rx: 1.00, ry: 0.15 },
  cono: [
    [-0.52, -0.04],
    [-0.32, -0.40, -0.02, -0.70],
    [0.18, -0.90, 0.55, -0.68], // la punta cae hacia la derecha
    [0.30, -0.66, 0.24, -0.54],
    [0.40, -0.30, 0.52, -0.04],
  ],
  /** La franja, recortada al cono. */
  banda: { desde: -0.10, hasta: -0.24 },
  hebilla: { ancho: 0.18, alto: 0.14, y: -0.17 },
  /** rad: el gorro va ladeado, con gracia. */
  ladeo: -0.10,
  /** R que sube al girar ('hecho'), con |sin(roll/2)|. */
  salto: 0.12,
  /** rad con el giro de 'hecho' y el mareo: sin(roll). */
  bamboleo: 0.22,
  /** Se lo levanta con la mano al saludar: × la mano (0…1). Sube 0,08 y no
   *  0,12: ladeado al saludar, con 0,12 la punta tocaba el borde del lienzo. */
  saludo: { sube: 0.08, gira: -0.25 },
  /** Sigue a la cabeza: × yaw. */
  sigueYaw: { x: 0.22, giro: 0.10 },
  /** rad: dormido, se le escurre. */
  dormido: 0.16,
} as const;

/** Por debajo de este lado de lienzo (un icono de 18 o 20) la banda no llega a
 *  1 px: se dibuja sin ella, solo cono, ala y silueta. */
export const LADO_MINIMO_BANDA = 30;

/** Lo que mueve el gorro, del motor: la cabeza (yaw), el giro (roll), la mano
 *  del saludo (0…1) y lo dormido que está (0…1). */
export interface MovimientoGorro { yaw: number; roll: number; manos: number; dormido: number }
export const GORRO_EN_REPOSO: MovimientoGorro = { yaw: 0, roll: 0, manos: 0, dormido: 0 };

/** Dónde va el centro del ala respecto al centro del cuerpo (en R) y cuánto gira (rad). */
export function posturaDelGorro(m: MovimientoGorro): { x: number; y: number; giro: number } {
  const g = GORRO_BRUJA;
  return {
    x: m.yaw * g.sigueYaw.x,
    y: g.alaY * SEMIEJE_Y - g.salto * Math.abs(Math.sin(m.roll / 2)) - g.saludo.sube * m.manos,
    giro: g.ladeo + g.bamboleo * Math.sin(m.roll) + g.saludo.gira * m.manos + g.sigueYaw.giro * m.yaw + g.dormido * m.dormido,
  };
}

/** Lo que hace falta para trazar una curva: lo cumplen Path2D y el `d` del SVG. */
export interface Trazo {
  moveTo(x: number, y: number): void;
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void;
  closePath(): void;
}

/** Traza el cono pasando cada punto (en R, desde el centro del ala) por `a`. */
export function trazarCono(t: Trazo, a: (x: number, y: number) => readonly [number, number]): void {
  const [m, ...curvas] = GORRO_BRUJA.cono;
  t.moveTo(...a(m[0], m[1]));
  for (const [cx, cy, x, y] of curvas as readonly (readonly [number, number, number, number])[]) {
    const [px, py] = a(cx, cy), [qx, qy] = a(x, y);
    t.quadraticCurveTo(px, py, qx, qy);
  }
  t.closePath();
}

/** Las esquinas de un rectángulo (en R, desde el centro del ala), en orden. */
function esquinas(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
}
/** La banda, más ancha que el cono: se recorta a él. */
export const BANDA_ESQUINAS = esquinas(-0.7, GORRO_BRUJA.banda.hasta, 0.7, GORRO_BRUJA.banda.desde);
export const HEBILLA_ESQUINAS = (() => {
  const { ancho, alto, y } = GORRO_BRUJA.hebilla;
  return esquinas(-ancho / 2, y - alto / 2, ancho / 2, y + alto / 2);
})();

/** Puntos del contorno del cono (las curvas, muestreadas), en R desde el centro del ala. */
export function puntosDelCono(pasos = 24): [number, number][] {
  const out: [number, number][] = [];
  let ultimo: [number, number] = [0, 0];
  trazarCono({
    moveTo: (x, y) => { ultimo = [x, y]; out.push(ultimo); },
    quadraticCurveTo: (cx, cy, x, y) => {
      const [x0, y0] = ultimo;
      for (let i = 1; i <= pasos; i++) {
        const t = i / pasos, u = 1 - t;
        out.push([u * u * x0 + 2 * u * t * cx + t * t * x, u * u * y0 + 2 * u * t * cy + t * t * y]);
      }
      ultimo = [x, y];
    },
    closePath: () => {},
  }, (x, y) => [x, y]);
  return out;
}

export interface DibujoGorro {
  /** El `d` del cono. */
  cono: string;
  /** El `d` de la banda (se recorta al cono). */
  banda: string;
  /** El ala: elipse girada `giro` grados alrededor de su centro. */
  ala: { cx: number; cy: number; rx: number; ry: number; giro: number };
  /** El `d` de la hebilla. */
  hebilla: string;
}

/** El gorro de bruja en las coordenadas del icono (lado 100), en la pose de reposo. */
function dibujoDelGorroBruja(): DibujoGorro {
  const { R } = medidas(LADO_ICONO);
  const cx = LADO_ICONO / 2, cy = LADO_ICONO / 2 + R * BAJADA;
  const p = posturaDelGorro(GORRO_EN_REPOSO);
  const co = Math.cos(p.giro), si = Math.sin(p.giro);
  const ax = cx + p.x * R, ay = cy + p.y * R;
  const a = (x: number, y: number) => [r3(ax + (x * co - y * si) * R), r3(ay + (x * si + y * co) * R)] as const;
  let cono = '';
  trazarCono({
    moveTo: (x, y) => { cono += `M${x} ${y}`; },
    quadraticCurveTo: (qx, qy, x, y) => { cono += `Q${qx} ${qy} ${x} ${y}`; },
    closePath: () => { cono += 'Z'; },
  }, a);
  const poligono = (pts: [number, number][]) => `${pts.map(([x, y], i) => `${i ? 'L' : 'M'}${a(x, y).join(' ')}`).join('')}Z`;
  return {
    cono,
    banda: poligono(BANDA_ESQUINAS),
    ala: { cx: r3(ax), cy: r3(ay), rx: r3(R * GORRO_BRUJA.ala.rx), ry: r3(R * GORRO_BRUJA.ala.ry), giro: r3(p.giro * 180 / Math.PI) },
    hebilla: poligono(HEBILLA_ESQUINAS),
  };
}

// Un dibujo por traje: un traje nuevo sin el suyo no compila.
const DIBUJOS_DE_TRAJE: Record<Traje, () => DibujoGorro> = { bruja: dibujoDelGorroBruja };

/** El traje en las coordenadas del icono (lado 100), en la pose de reposo, para el SVG de reserva. */
export function dibujoDelTraje(traje: Traje): DibujoGorro {
  return DIBUJOS_DE_TRAJE[traje]();
}
