// El motor de Tenti, probado sin navegador: lo que dibuja y cuándo se mueve.
//
// Ningún test del panel ve un canvas (el e2e lee atributos, no píxeles), así que
// los colores se comprueban aquí, en la fuente: un contexto 2D falso apunta cada
// fillStyle, strokeStyle y parada de degradado de cada fotograma. Antes de la
// paleta por tokens, esta misma sonda encontraba en 'hecho' el aro #000 y el
// punto #34D399 de la insignia y unos mofletes rgba(255,120,150,…) que no son
// de Tentare.
//
// El reloj es falso (performance.now y setTimeout), así que 1,5 s de animación
// tardan lo que tarda el bucle, y siempre salen igual.
import { test, mock, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Tenti, ESTADOS, animacionDeEntrada, type EstadoTenti } from './motor.ts';
import type { PaletaTenti } from './paleta.ts';

const PALETA: PaletaTenti = {
  cuerpo: ['#FFFAF5', '#DDCCBF'], tinta: '#1A1412', rubor: '#C98F76', chispa: '#B8975A', hecho: '#2F6B4F',
};

type RGB = [number, number, number];
const hexRgb = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;

/** '#RRGGBB', '#RGB' o 'rgba(r,g,b,a)' → [r, g, b]. */
function aRgb(c: string): RGB {
  const s = c.trim().toLowerCase();
  const m = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  if (/^#[0-9a-f]{3}$/.test(s)) return [1, 2, 3].map((i) => parseInt(s[i] + s[i], 16)) as RGB;
  if (/^#[0-9a-f]{6}$/.test(s)) return hexRgb(s);
  throw new Error(`color que la sonda no sabe leer: ${c}`);
}
const cerca = (a: RGB, b: RGB) => a.every((v, i) => Math.abs(v - b[i]) <= 1);

// Colores del prototipo que no pueden volver a pintarse con paleta: el menta de
// 'hecho', los mofletes rosa chicle y los de los estados que el panel no usa.
const PROHIBIDOS_RGB: Array<[string, RGB]> = [
  ['#34D399', hexRgb('#34D399')], ['rgba(255,120,150', [255, 120, 150]], ['#FF4D6D', hexRgb('#FF4D6D')],
  ['#F7B32B', hexRgb('#F7B32B')], ['#7CC7FF', hexRgb('#7CC7FF')], ['#3B9EFF', hexRgb('#3B9EFF')], ['#F5A524', hexRgb('#F5A524')],
];
// El negro y el blanco opacos (el aro y el texto de la insignia, la chispa
// blanca). El sombreado neutro, rgba(0,0,0,.2) y rgba(255,255,255,.55), sí vale.
const PROHIBIDOS_LITERALES = new Set(['#000', '#000000', '#fff', '#ffffff']);

// ── El escenario: reloj falso, Path2D y un contexto 2D que lo apunta todo ───
let reloj = 0;
const nowOriginal = performance.now;
let fotogramaActual: string[] = [];

before(() => {
  (globalThis as { Path2D?: unknown }).Path2D = class {
    moveTo() {} lineTo() {} closePath() {} roundRect() {}
  };
  performance.now = () => reloj;
});
after(() => {
  performance.now = nowOriginal;
  delete (globalThis as { Path2D?: unknown }).Path2D;
});
beforeEach(() => { reloj = 10_000; mock.timers.enable({ apis: ['setTimeout'] }); });
afterEach(() => { mock.timers.reset(); });

function contextoFalso(): CanvasRenderingContext2D {
  const apuntar = (v: unknown) => { if (typeof v === 'string') fotogramaActual.push(v); };
  const degradado = () => ({ addColorStop: (_: number, c: string) => apuntar(c) });
  const campos: Record<string | symbol, unknown> = {};
  return new Proxy(campos, {
    get(t, k) {
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return degradado;
      if (k in t) return t[k];
      return () => {};
    },
    set(t, k, v) {
      if (k === 'fillStyle' || k === 'strokeStyle') apuntar(v);
      t[k] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

function crear(opciones: ConstructorParameters<typeof Tenti>[1] = {}) {
  const canvas = { width: 0, height: 0, getContext: () => contextoFalso() } as unknown as HTMLCanvasElement;
  const motor = new Tenti(canvas, opciones);
  motor.medir(120);
  return motor;
}

/** Corre `ms` de animación a 60 fps y devuelve los colores de cada fotograma. */
function correr(motor: Tenti, ms: number): string[][] {
  const fotogramas: string[][] = [];
  for (let t = 0; t < ms; t += 16) {
    reloj += 16;
    mock.timers.tick(16);
    fotogramaActual = [];
    motor.fotograma();
    fotogramas.push(fotogramaActual);
  }
  return fotogramas;
}

function comprobarPaleta(estado: EstadoTenti) {
  const motor = crear({ paleta: PALETA, insignias: false });
  motor.ponerEstado(estado, { forzar: true, silencio: true });
  const fotogramas = correr(motor, 1500);
  motor.destruir();

  fotogramas.forEach((colores, i) => {
    for (const c of colores) {
      assert.ok(!PROHIBIDOS_LITERALES.has(c.trim().toLowerCase()), `'${estado}', fotograma ${i}: pinta ${c}`);
      const rgb = aRgb(c);
      for (const [nombre, prohibido] of PROHIBIDOS_RGB) {
        assert.ok(!cerca(rgb, prohibido), `'${estado}', fotograma ${i}: pinta ${c} (${nombre}), que no es de la paleta`);
      }
    }
  });

  const permitidos: RGB[] = [
    ...[PALETA.cuerpo[0], PALETA.cuerpo[1], PALETA.tinta, PALETA.rubor, PALETA.chispa, PALETA.hecho].map(hexRgb),
    [0, 0, 0], [255, 255, 255],
  ];
  const ultimo = fotogramas.at(-1)!;
  assert.ok(ultimo.length > 0, 'el último fotograma no ha pintado nada');
  for (const c of ultimo) {
    assert.ok(permitidos.some((p) => cerca(aRgb(c), p)), `'${estado}', último fotograma: ${c} no es de la paleta ni neutro`);
  }
  return fotogramas.flat().map(aRgb);
}

test("en 'reposo', con paleta y sin insignias, todo color sale de la paleta", () => {
  const pintados = comprobarPaleta('reposo');
  // Los mofletes nunca bajan del todo: tienen que salir del token de rubor.
  assert.ok(pintados.some((c) => cerca(c, hexRgb(PALETA.rubor))), 'los mofletes no usan paleta.rubor');
  assert.ok(pintados.some((c) => cerca(c, hexRgb(PALETA.tinta))), 'los ojos no usan paleta.tinta');
});

test("en 'hecho', con paleta y sin insignias: tinte de paleta.hecho, chispas de paleta.chispa, sin aro ni punto", () => {
  const pintados = comprobarPaleta('hecho');
  assert.ok(pintados.some((c) => cerca(c, hexRgb(PALETA.hecho))), "'hecho' no tiñe con paleta.hecho");
  assert.ok(pintados.some((c) => cerca(c, hexRgb(PALETA.chispa))), 'las chispas no usan paleta.chispa');
});

test('las manos del saludo usan el cuerpo de la paleta', () => {
  const motor = crear({ paleta: PALETA, insignias: false });
  assert.equal(motor.saludar(), true);
  const pintados = correr(motor, 600).flat();
  motor.destruir();
  for (const c of pintados) {
    for (const [nombre, prohibido] of PROHIBIDOS_RGB) assert.ok(!cerca(aRgb(c), prohibido), `el saludo pinta ${c} (${nombre})`);
  }
});

test("ponerPaleta cambia los colores sin esperar a la mezcla (claro → oscuro)", () => {
  const motor = crear({ paleta: PALETA, insignias: false });
  motor.ponerEstado('hecho', { forzar: true, silencio: true });
  correr(motor, 1500);
  const oscura: PaletaTenti = { ...PALETA, cuerpo: ['#E4DCD2', '#B3A496'], hecho: '#7FBE9C' };
  motor.ponerPaleta(oscura);
  const [primero] = correr(motor, 16);
  motor.destruir();
  const rgb = primero.map(aRgb);
  assert.ok(rgb.some((c) => cerca(c, hexRgb('#E4DCD2'))), 'el cuerpo no ha cambiado al momento');
  assert.ok(rgb.some((c) => cerca(c, hexRgb('#7FBE9C'))), 'el tinte de hecho no ha cambiado al momento');
  assert.ok(!rgb.some((c) => cerca(c, hexRgb(PALETA.hecho))), 'queda el verde de la paleta anterior');
});

test("animacionDeEntrada: 'hecho' gira y echa chispas; con «reducir movimiento», como mucho parpadea", () => {
  assert.ok(animacionDeEntrada('hecho', false).includes('rodar'));
  assert.ok(animacionDeEntrada('hecho', false).includes('chispas'));
  const quieto = animacionDeEntrada('hecho', true);
  assert.ok(!quieto.includes('rodar') && !quieto.includes('chispas'), `con quieto, 'hecho' anima ${quieto.join(', ')}`);
  for (const e of Object.keys(ESTADOS) as EstadoTenti[]) {
    const a = animacionDeEntrada(e, true);
    assert.ok(a.every((x) => x === 'parpadear'), `con quieto, '${e}' anima ${a.join(', ')}`);
  }
});

test('con «reducir movimiento», saludar() no hace nada: ni anima ni cuenta', () => {
  const motor = crear({ paleta: PALETA, insignias: false, quieto: true });
  correr(motor, 3000);
  assert.equal(motor.animando(), false, 'quieto y en reposo, no debería quedar nada por moverse');
  assert.equal(motor.saludar(), false);
  assert.equal(motor.saludos, 0);
  assert.equal(motor.animando(), false, 'saludar() con quieto ha dejado algo animándose');
  motor.destruir();

  // Control: sin quieto, el mismo saludo sí anima y cuenta.
  const despierto = crear({ paleta: PALETA, insignias: false });
  assert.equal(despierto.saludar(), true);
  assert.equal(despierto.saludos, 1);
  assert.equal(despierto.animando(), true);
  despierto.destruir();
});

test("con «reducir movimiento», 'hecho' termina y el bucle se puede dormir", () => {
  const motor = crear({ paleta: PALETA, insignias: false, quieto: true });
  correr(motor, 500);
  motor.ponerEstado('hecho');
  let fotogramas = 0;
  while (motor.animando() && fotogramas < 600) { correr(motor, 16); fotogramas++; }
  assert.ok(fotogramas < 600, "con quieto, 'hecho' no deja de animarse nunca");
  // Y ya dormido no se despierta solo: ni parpadeos ni partículas de ambiente.
  for (let i = 0; i < 20; i++) {
    correr(motor, 500);
    assert.equal(motor.animando(), false, `con quieto se ha puesto a animarse solo (a los ${(i + 1) * 0.5} s)`);
  }
  motor.destruir();
});

test('destruir() cancela lo pendiente: las chispas de «hecho» ya no salen', () => {
  const motor = crear({ paleta: PALETA, insignias: false });
  motor.ponerEstado('hecho', { forzar: true, silencio: true });
  motor.destruir();
  const pintados = correr(motor, 1500).flat().map(aRgb);
  assert.ok(!pintados.some((c) => cerca(c, hexRgb(PALETA.chispa))), 'han salido chispas después de destruir()');
});

// ── El bucle duerme entre parpadeos ─────────────────────────────────────────
//
// components/tenti/tenti.tsx pide un fotograma mientras animando() o perpetuo()
// digan que sí y, si no, duerme hasta proximoDespertar(). Aquí se repite esa
// misma regla con el reloj falso, y se mira lo que se ve en cada siesta.

const abiertos = (m: Tenti) => (m as unknown as { s: { open: number } }).s.open;

/** El bucle de tenti.tsx durante `ms`: fotogramas de 16 ms mientras algo se mueve, y un salto hasta el próximo despertar si no. */
function vivir(motor: Tenti, ms: number) {
  const fin = reloj + ms;
  const r = { fotogramas: 0, siestas: 0, parpadeos: 0, abiertosAlDormir: [] as number[], despertaresPerdidos: 0 };
  let cerrado = false;
  // Al acabar el plazo, se deja terminar lo que esté a medias (un parpadeo doble
  // partido por el final no es uno perdido).
  while (reloj < fin || motor.animando()) {
    reloj += 16;
    mock.timers.tick(16);
    motor.fotograma();
    r.fotogramas++;
    const a = abiertos(motor);
    if (a < 0.5 && !cerrado) { r.parpadeos++; cerrado = true; } else if (a >= 0.5) cerrado = false;
    if (motor.animando() || motor.perpetuo() || reloj >= fin) continue;
    r.siestas++;
    r.abiertosAlDormir.push(a);
    const despertar = motor.proximoDespertar();
    if (!Number.isFinite(despertar)) { reloj = fin; break; }
    if (despertar < reloj) r.despertaresPerdidos++;
    const salto = Math.max(0, Math.ceil(despertar - reloj));
    reloj += salto;
    mock.timers.tick(salto);
  }
  return r;
}

test('en reposo el bucle duerme: pocos fotogramas, y cada siesta con los ojos abiertos del todo', () => {
  const motor = crear({ paleta: PALETA, insignias: false });
  const r = vivir(motor, 30_000);
  motor.destruir();
  // A 60 fps serían 1875. Cada parpadeo son unos 200 ms de animación (y algo de
  // cola mientras converge): con uno cada 2,2–5,4 s, muy por debajo.
  assert.ok(r.fotogramas < 600, `${r.fotogramas} fotogramas en 30 s de reposo: no se duerme`);
  assert.ok(r.siestas >= 5, `solo ${r.siestas} siestas en 30 s`);
  for (const a of r.abiertosAlDormir) assert.ok(a > 0.99, `se ha dormido con los ojos a medio cerrar (open=${a.toFixed(3)})`);
});

test('dormido, no se pierde ningún parpadeo: se despierta a su hora', () => {
  const motor = crear({ paleta: PALETA, insignias: false });
  const r = vivir(motor, 30_000);
  motor.destruir();
  // Uno cada 2,2–5,4 s (el primero entre 1,5 y 3,5): en 30 s, de 5 a 14.
  assert.ok(r.parpadeos >= 5 && r.parpadeos <= 16, `${r.parpadeos} parpadeos en 30 s`);
  assert.equal(r.despertaresPerdidos, 0, 'ha programado un despertar que ya había pasado');
});

test('el parpadeo doble no se queda a medias: el hueco de 30 ms entre los dos no lo duerme', () => {
  const random = Math.random;
  Math.random = () => 0.1; // < 0,22: siempre doble
  try {
    const motor = crear({ paleta: PALETA, insignias: false });
    const r = vivir(motor, 12_000);
    motor.destruir();
    assert.ok(r.parpadeos >= 4, `${r.parpadeos} parpadeos: el segundo de cada par no ha llegado`);
    assert.equal(r.parpadeos % 2, 0, `${r.parpadeos} parpadeos: alguno doble se ha quedado en uno`);
    for (const a of r.abiertosAlDormir) assert.ok(a > 0.99, `se ha dormido entre los dos parpadeos (open=${a.toFixed(3)})`);
  } finally { Math.random = random; }
});

test('dormido, se despierta al cambiar de estado, con una emoción, al saludar y al mirar a otro lado', () => {
  const motor = crear({ paleta: PALETA, insignias: false });
  const dormido = () => { vivir(motor, 500); while (motor.animando()) correr(motor, 16); };
  dormido();
  assert.equal(motor.animando() || motor.perpetuo(), false);
  motor.ponerEstado('hecho', { silencio: true });
  assert.ok(motor.animando(), "ponerEstado('hecho') no lo despierta");
  dormido();
  motor.emocion('feliz', 900, true);
  assert.ok(motor.animando(), 'una emoción no lo despierta');
  dormido();
  assert.ok(motor.saludar());
  assert.ok(motor.animando() && motor.perpetuo(), 'saludar no lo despierta');
  dormido();
  motor.mira.x = 0.8;
  correr(motor, 16); // el fotograma que pide quien cambia `mira` (tenti.tsx)
  assert.ok(motor.animando(), 'mirar a otro lado no lo despierta');
  dormido();
  motor.destruir();
});

test('perpetuo: lo que oscila sin fin no deja dormir; en reposo y con «reducir movimiento», sí', () => {
  const casos: Array<[EstadoTenti, boolean]> = [
    ['reposo', false], ['hecho', false], ['buscando', true], ['esperaTuOk', true], ['dormido', true], ['mareado', true],
  ];
  for (const [estado, esperado] of casos) {
    const motor = crear({ paleta: PALETA, insignias: false });
    motor.ponerEstado(estado, { forzar: true, silencio: true });
    assert.equal(motor.perpetuo(), esperado, `'${estado}'`);
    motor.destruir();
    const quieto = crear({ paleta: PALETA, insignias: false, quieto: true });
    quieto.ponerEstado(estado, { forzar: true, silencio: true });
    assert.equal(quieto.perpetuo(), false, `'${estado}' con quieto`);
    assert.equal(quieto.proximoDespertar(), Infinity, `'${estado}' con quieto no tiene por qué despertar`);
    quieto.destruir();
  }
  // La insignia de puntos se mueve; en mini no se dibuja.
  const conPuntos = crear({ paleta: PALETA, insignias: true });
  conPuntos.ponerEstado('pensando', { forzar: true, silencio: true });
  correr(conPuntos, 200);
  assert.equal(conPuntos.perpetuo(), true, "'pensando' con insignia");
  conPuntos.destruir();
  const mini = crear({ paleta: PALETA, insignias: true, mini: true });
  mini.ponerEstado('pensando', { forzar: true, silencio: true });
  correr(mini, 200);
  assert.equal(mini.perpetuo(), false, "'pensando' en mini: el punto no se mueve");
  mini.destruir();
});

// ── Vivo a tamaño de icono: mira alrededor y lleva silueta ──────────────────
//
// Desde el 5-oct-2026 Tenti va vivo en todos sus sitios (decisión del
// fundador), también a 18-28 px. Mirar alrededor no puede convertir la siesta
// en un bucle de 60 fps, y la silueta es la del icono.

const yaw = (m: Tenti) => (m as unknown as { s: { yaw: number } }).s.yaw;

test('con miradas, en reposo mira a los lados de vez en cuando y vuelve al frente', () => {
  const motor = crear({ paleta: PALETA, insignias: false, miradas: true, mini: true });
  let maximo = 0, vueltasAlFrente = 0, fuera = false;
  for (let i = 0; i < 30_000 / 16; i++) {
    correr(motor, 16);
    const y = Math.abs(yaw(motor));
    maximo = Math.max(maximo, y);
    if (y > 0.15) fuera = true;
    else if (fuera && y < 0.02) { vueltasAlFrente++; fuera = false; }
  }
  motor.destruir();
  assert.ok(maximo > 0.2, `en 30 s no ha mirado a ningún lado (yaw máx ${maximo.toFixed(3)})`);
  assert.ok(vueltasAlFrente >= 2, `solo ha vuelto al frente ${vueltasAlFrente} veces en 30 s`);
});

test('con miradas, el bucle sigue durmiendo: muy por debajo de 60 fps', () => {
  const motor = crear({ paleta: PALETA, insignias: false, miradas: true, mini: true });
  const r = vivir(motor, 30_000);
  motor.destruir();
  // A 60 fps serían 1875: parpadeos y miradas tienen que quedarse en una parte.
  assert.ok(r.fotogramas < 900, `${r.fotogramas} fotogramas en 30 s con miradas`);
  assert.equal(r.despertaresPerdidos, 0);
  for (const a of r.abiertosAlDormir) assert.ok(a > 0.99, `dormido con los ojos a medio cerrar (open=${a.toFixed(3)})`);
});

test("las miradas son solo de 'reposo', y con «reducir movimiento» no hay ninguna", () => {
  const quieto = crear({ paleta: PALETA, insignias: false, miradas: true, mini: true, quieto: true });
  correr(quieto, 20_000);
  assert.equal(yaw(quieto), 0, 'con quieto ha girado la cabeza');
  assert.equal(quieto.proximoDespertar(), Infinity);
  quieto.destruir();
  const hecho = crear({ paleta: PALETA, insignias: false, miradas: true, mini: true });
  hecho.ponerEstado('hecho', { forzar: true, silencio: true });
  correr(hecho, 3_000);
  const tras = Math.abs(yaw(hecho));
  correr(hecho, 15_000);
  assert.ok(Math.abs(yaw(hecho)) < 0.01 && tras < 0.01, "en 'hecho' se ha puesto a mirar alrededor");
  hecho.destruir();
});

test('la silueta se pinta con su color, y sin ella no hay trazo', () => {
  const con = crear({ paleta: PALETA, insignias: false, silueta: '#94857A' });
  const pintados = correr(con, 32).flat();
  con.destruir();
  assert.ok(pintados.some((c) => cerca(aRgb(c), hexRgb('#94857A'))), 'la silueta no usa su color');
  const sin = crear({ paleta: PALETA, insignias: false });
  const otros = correr(sin, 32).flat();
  sin.destruir();
  assert.ok(!otros.some((c) => cerca(aRgb(c), hexRgb('#94857A'))));
});
