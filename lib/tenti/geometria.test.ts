// Una sola geometría para los dos Tentis: el del canvas (motor.ts) y el icono
// SVG de lo diario (components/tenti/tenti-icono.tsx). Lo que se fija aquí es
// lo que un repaso visual no ve a 18 px: que el icono sea de verdad el mismo
// dibujo, que su caja mida el cuerpo y no aire, y que el motor no vuelva a
// llevar sus propios números (dos copias de un dibujo divergen al primer
// retoque, y nadie compara un canvas con un SVG a ojo).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BAJADA, EXPONENTE, GORRO_BRUJA, GORRO_EN_REPOSO, LADO_ICONO, LUZ, MOFLETE, OJO, R_DEL_LADO, SEMIEJE_X, SEMIEJE_Y, TRAMOS,
  colocarOjo, contorno, dibujoDelIcono, dibujoDelTraje, medidas, pildora, posturaDelGorro, puntosDelCono,
} from './geometria.ts';
import { ESTADOS } from './motor.ts';
import { LISTA_TRAJES } from './trajes.ts';

const raiz = join(import.meta.dirname, '..', '..');
const cerca = (a: number, b: number, tol = 0.01) => Math.abs(a - b) <= tol;

const { R, rx, ry } = medidas(LADO_ICONO);
const CX = LADO_ICONO / 2, CY = LADO_ICONO / 2 + R * BAJADA;
const D = dibujoDelIcono();

/** Dentro de la superelipse del cuerpo (relativo a su centro). */
const dentro = (x: number, y: number) => Math.abs(x / rx) ** EXPONENTE + Math.abs(y / ry) ** EXPONENTE < 1;

test('el contorno: 73 puntos, cerrado, y su caja es exactamente el viewBox del icono', () => {
  const pts = contorno(rx, ry);
  assert.equal(pts.length, TRAMOS + 1);
  assert.equal(pts.length, 73);
  const [x0, y0] = pts[0], [xn, yn] = pts.at(-1)!;
  assert.ok(cerca(x0, xn, 1e-9) && cerca(y0, yn, 1e-9), 'el último punto no vuelve al primero');
  const xs = pts.map(([x]) => CX + x), ys = pts.map(([, y]) => CY + y);
  const caja = [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
  const esperada = [15.8, 25.4, 68.4, 52.8];
  caja.forEach((v, i) => assert.ok(cerca(v, esperada[i], 0.1), `caja del contorno ${caja.join(' ')}, se esperaba ${esperada.join(' ')}`));
  // Y el viewBox del icono es ese, ceñido: `ancho` mide a Tenti, no aire.
  D.viewBox.split(' ').map(Number).forEach((v, i) => assert.ok(cerca(v, esperada[i], 0.1), `viewBox ${D.viewBox}`));
  assert.ok(cerca(D.proporcion, 52.8 / 68.4, 1e-3), `proporción ${D.proporcion}`);
});

test('el `d` del icono recorre los mismos 73 puntos que el canvas', () => {
  const tramos = D.cuerpo.match(/[ML][^MLZ]+/g) ?? [];
  assert.equal(tramos.length, 73);
  assert.ok(D.cuerpo.endsWith('Z'), 'el cuerpo no se cierra');
  contorno(rx, ry).forEach(([x, y], i) => {
    const [px, py] = tramos[i].slice(1).trim().split(/\s+/).map(Number);
    assert.ok(cerca(px, CX + x, 1e-3) && cerca(py, CY + y, 1e-3), `punto ${i}: ${tramos[i]}`);
  });
});

test('los ojos: simétricos, del mismo tamaño y dentro del cuerpo', () => {
  assert.equal(D.ojos.length, 2);
  const [izq, der] = D.ojos;
  const centro = (o: typeof izq) => [o.x + o.ancho / 2, o.y + o.alto / 2];
  const [xi, yi] = centro(izq), [xd, yd] = centro(der);
  assert.ok(xi < CX && xd > CX, 'los ojos no están a cada lado');
  assert.ok(cerca(xi + xd, 2 * CX), `no son simétricos: ${xi} y ${xd} alrededor de ${CX}`);
  assert.ok(cerca(yi, yd), 'no están a la misma altura');
  assert.ok(cerca(izq.ancho, der.ancho) && cerca(izq.alto, der.alto), 'no miden lo mismo');
  for (const o of D.ojos) {
    for (const [x, y] of [[o.x, o.y], [o.x + o.ancho, o.y], [o.x, o.y + o.alto], [o.x + o.ancho, o.y + o.alto]]) {
      assert.ok(dentro(x - CX, y - CY), `un ojo se sale del cuerpo en (${x}, ${y})`);
    }
    // Una píldora: las esquinas son medio ancho, nunca un rectángulo.
    assert.ok(cerca(o.rx, o.ancho / 2, 0.002), `el ojo no es una píldora: rx ${o.rx} de ${o.ancho}`);
  }
  // A 18 px de ancho, cada ojo mide unos 2 px de alto: por debajo de eso, el 16
  // que no existe.
  const altoA18 = izq.alto * (18 / D.caja.ancho);
  assert.ok(altoA18 > 1.9, `a 18 px el ojo mide ${altoA18.toFixed(2)} px`);
});

test('los mofletes: a cada lado, dentro del cuerpo y al mínimo del canvas', () => {
  assert.equal(D.mofletes.length, 2);
  for (const m of D.mofletes) {
    for (const [x, y] of [[m.cx - m.rx, m.cy], [m.cx + m.rx, m.cy], [m.cx, m.cy + m.ry]]) {
      assert.ok(dentro(x - CX, y - CY), `un moflete se sale del cuerpo en (${x}, ${y})`);
    }
  }
  assert.ok(cerca(D.mofletes[0].cx + D.mofletes[1].cx, 2 * CX));
  assert.ok(cerca(D.mofletes[1].cx, CX + rx * MOFLETE.x) && cerca(D.mofletes[1].cy, CY + ry * MOFLETE.y));
  assert.ok(cerca(D.mofletes[1].rx, R * MOFLETE.rx) && cerca(D.mofletes[1].ry, R * MOFLETE.ry));
  // El canvas los pinta a 0,5 × máx(blush, 0,35): en reposo, 0,175.
  assert.ok(cerca(D.opacidadMofletes, 0.175, 1e-9), `opacidad de los mofletes ${D.opacidadMofletes}`);
});

test('la luz del icono es la del canvas: mismo degradado, mismo volumen y mismo brillo', () => {
  assert.ok(cerca(D.degradado.x1, CX + rx * LUZ.degradado.desde[0]) && cerca(D.degradado.y2, CY + ry * LUZ.degradado.hasta[1]));
  assert.ok(cerca(D.volumen.fx, CX + rx * LUZ.volumen.foco[0]) && cerca(D.volumen.r, R * LUZ.volumen.radio));
  assert.ok(cerca(D.brillo.cy, CY + ry * LUZ.brillo.centro[1]) && cerca(D.brillo.r, R * LUZ.brillo.radio));
});

test("el icono es la pose de reposo, también en 'pensando': la cabeza al frente, nunca la mirada del canvas", () => {
  const pil = pildora(R * OJO.w, R * OJO.h, 1);
  const centros = (yaw: number, pitch: number) => ([-1, 1] as const).map((lado) => {
    const o = colocarOjo(lado, yaw, pitch, rx, ry)!;
    return [CX + o.x, CY + o.y, pil.ancho * o.escalaX, pil.alto * o.escalaY];
  });
  const delIcono = D.ojos.map((o) => [o.x + o.ancho / 2, o.y + o.alto / 2, o.ancho, o.alto]);
  // Igual que el canvas con la cabeza al frente…
  centros(0, 0).forEach((c, i) => c.forEach((v, j) => assert.ok(cerca(v, delIcono[i][j], 2e-3), `ojo ${i}: ${delIcono[i]} frente a ${c}`)));
  // …y distinto del canvas en 'pensando', que mira arriba a la derecha (el
  // gesto de asistente que piensa, que se queda en /interno). Así lo asienta
  // el motor: yaw → mira[0]·0,55, pitch → mira[1]·0,5.
  const mira = ESTADOS.pensando.mira;
  const pensandoCanvas = centros(mira[0] * 0.55, mira[1] * 0.5);
  assert.ok(pensandoCanvas.some((c, i) => !cerca(c[0], delIcono[i][0], 0.5)), 'el icono ha cogido la mirada del canvas');
  // `dibujoDelIcono` no recibe estado: no hay manera de pedirle otra pose.
  assert.equal(dibujoDelIcono.length, 0);
  // Y el componente lo calcula una vez, sin estado.
  const icono = readFileSync(join(raiz, 'components/tenti/tenti-icono.tsx'), 'utf8');
  assert.match(icono, /^const D = dibujoDelIcono\(\);$/m);
});

test('el motor dibuja con esta geometría y no con números propios', () => {
  const motor = readFileSync(join(raiz, 'lib/tenti/motor.ts'), 'utf8');
  const imp = /import\s*\{([^}]*)\}\s*from\s*'\.\/geometria\.ts'/.exec(motor);
  assert.ok(imp, "motor.ts no importa './geometria.ts'");
  for (const n of ['medidas', 'recorrerContorno', 'colocarOjo', 'pildora', 'OJO', 'MOFLETE', 'LUZ', 'BAJADA']) {
    assert.match(imp[1], new RegExp(`\\b${n}\\b`), `motor.ts no importa ${n} de la geometría`);
  }
  // Sin comentarios, para que la historia contada en ellos no cuente.
  const codigo = motor.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
  // Las expresiones que había antes, una por pieza del dibujo. (Números sueltos
  // como 0,55 o 0,42 no valen: el motor los usa también para otras cosas, la
  // mirada de 'pensando' o la insignia.)
  for (const [patron, que] of [
    [/W \* 0\.3\b/, 'R a mano'], [new RegExp(`\\b${SEMIEJE_X}\\b`), 'el semieje x'], [new RegExp(`\\b${SEMIEJE_Y}\\b`), 'el semieje y'],
    [/2 \/ 2\.7/, 'el exponente'], [/<= 72\b/, 'los tramos del contorno'], [new RegExp(`\\b${OJO.sp}\\b`), 'la separación de los ojos'],
    [/Math\.max\(0\.18/, 'el giro de los ojos'], [/rx \* 0\.55/, 'el sitio de los mofletes'], [/rx \* 0\.7\b/, 'el degradado del cuerpo'],
    [/R \* 1\.25/, 'el volumen'], [/rx \* 0\.34/, 'el brillo'],
  ] as const) {
    assert.doesNotMatch(codigo, patron, `motor.ts vuelve a llevar ${que} a mano`);
  }
  assert.doesNotMatch(codigo, /const\s+OJO\s*=/, 'motor.ts vuelve a declarar su OJO');
});

// ── El gorro de bruja ────────────────────────────────────────────────────────

/** Un punto del gorro (en R, desde el centro del ala) en coordenadas del cuerpo (en R). */
function enElCuerpo([x, y]: [number, number], p: { x: number; y: number; giro: number }): [number, number] {
  const c = Math.cos(p.giro), si = Math.sin(p.giro);
  return [p.x + x * c - y * si, p.y + x * si + y * c];
}

test('el gorro, con su salto, su bamboleo, el saludo y el trazo, cabe en el lienzo', () => {
  // El lienzo empieza (0,5/0,3 + BAJADA) R por encima del centro del cuerpo y
  // acaba a 0,5/0,3 R a cada lado: ni el icono ni el canvas grande lo recortan.
  const arriba = -(0.5 / R_DEL_LADO + BAJADA), lado = 0.5 / R_DEL_LADO;
  const trazo = 0.05;
  let maxArriba = 0, maxLado = 0;
  // Las poses que de verdad se dan: girando ('hecho', el mareo) con la cabeza
  // donde sea, saludando y dormido. yaw ±0,62 es lo más que gira la cabeza.
  const poses = [
    ...Array.from({ length: 97 }, (_, i) => i / 96 * Math.PI * 4).flatMap((roll) => [-0.62, 0, 0.62].map((yaw) => ({ yaw, roll, manos: 0, dormido: 0 }))),
    ...[-0.62, 0, 0.62].map((yaw) => ({ yaw, roll: 0, manos: 1, dormido: 0 })),
    { yaw: 0, roll: 0, manos: 0, dormido: 1 },
  ];
  {
    for (const m of poses) {
      const p = posturaDelGorro(m);
      const ala = Array.from({ length: 48 }, (_, i) => {
        const a = i / 48 * Math.PI * 2;
        return [Math.cos(a) * GORRO_BRUJA.ala.rx, Math.sin(a) * GORRO_BRUJA.ala.ry] as [number, number];
      });
      for (const q of [...puntosDelCono(), ...ala]) {
        const [x, y] = enElCuerpo(q, p);
        maxArriba = Math.min(maxArriba, y);
        maxLado = Math.max(maxLado, Math.abs(x));
      }
    }
  }
  assert.ok(maxArriba - trazo > arriba, `el gorro llega a ${maxArriba.toFixed(3)} R y el lienzo empieza en ${arriba.toFixed(3)} R`);
  assert.ok(maxLado + trazo < lado, `el gorro llega a ${maxLado.toFixed(3)} R a un lado y el lienzo acaba en ${lado.toFixed(3)} R`);
});

test('el ala no tapa los ojos, ni mirando arriba del todo', () => {
  const p = posturaDelGorro(GORRO_EN_REPOSO);
  // Lo más bajo del ala girada (una elipse girada `giro`).
  const { rx, ry } = GORRO_BRUJA.ala;
  const bajo = p.y + Math.hypot(rx * Math.sin(p.giro), ry * Math.cos(p.giro));
  // Lo más alto de un ojo: la cabeza arriba del todo (pitch 0,5, como el motor).
  const ojo = colocarOjo(-1, 0, 0.5, SEMIEJE_X, SEMIEJE_Y)!;
  const altoOjo = (OJO.h * ojo.escalaY) / 2;
  const arribaOjo = ojo.y - altoOjo;
  assert.ok(bajo < arribaOjo, `el ala baja hasta ${bajo.toFixed(3)} R y el ojo sube hasta ${arribaOjo.toFixed(3)} R`);
});

test('el SVG del gorro sale de las mismas constantes que el canvas, en la pose de reposo', () => {
  assert.deepEqual(LISTA_TRAJES, ['bruja'], 'un traje nuevo: añade aquí su comprobación');
  const g = dibujoDelTraje('bruja');
  const p = posturaDelGorro(GORRO_EN_REPOSO);
  // El centro del ala.
  assert.ok(cerca(g.ala.cx, CX + p.x * R, 1e-3) && cerca(g.ala.cy, CY + p.y * R, 1e-3), `ala en ${g.ala.cx}, ${g.ala.cy}`);
  assert.ok(cerca(g.ala.rx, R * GORRO_BRUJA.ala.rx, 1e-3) && cerca(g.ala.ry, R * GORRO_BRUJA.ala.ry, 1e-3));
  assert.ok(cerca(g.ala.giro, GORRO_BRUJA.ladeo * 180 / Math.PI, 1e-3), `el ala gira ${g.ala.giro}°`);
  // El cono: una M, cuatro Q y cerrado; cada punto, el de GORRO_BRUJA ladeado y llevado al icono.
  const tramos = g.cono.match(/[MQ][^MQZ]+/g) ?? [];
  assert.equal(tramos.length, GORRO_BRUJA.cono.length);
  assert.ok(g.cono.endsWith('Z'));
  GORRO_BRUJA.cono.forEach((pieza, i) => {
    const numeros = tramos[i].slice(1).trim().split(/\s+/).map(Number);
    for (let k = 0; k < pieza.length; k += 2) {
      const [x, y] = enElCuerpo([pieza[k], pieza[k + 1]], p);
      assert.ok(cerca(numeros[k], CX + x * R, 2e-3) && cerca(numeros[k + 1], CY + y * R, 2e-3), `cono ${i}: ${tramos[i]}`);
    }
  });
  // En reposo el gorro va encima de la cabeza: lo más alto, por encima del cuerpo.
  const ys = (g.cono.match(/-?[\d.]+/g) ?? []).map(Number).filter((_, i) => i % 2 === 1);
  assert.ok(Math.min(...ys) < D.caja.y, 'el gorro no asoma por encima del cuerpo');
});
