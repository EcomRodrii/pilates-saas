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
import { Tenti, ESTADOS, MOVIMIENTO_PETICION_MS, MOVIMIENTO_SITUACION_MS, animacionDeEntrada, type EstadoTenti } from './motor.ts';
import { lienzoDeTenti } from './geometria.ts';
import type { PaletaTenti } from './paleta.ts';

const PALETA: PaletaTenti = {
  cuerpo: ['#FFFAF5', '#DDCCBF'], tinta: '#1A1412', rubor: '#C98F76', chispa: '#B8975A', hecho: '#2F6B4F',
  estados: { error: '#A8442A', esperaTuOk: '#8F6215', agobiado: '#8F6215', trabajando: '#3F5A7A' },
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
// ⚠️ Los TRAJES quedan fuera de esta regla, y a propósito: llevan los colores
// del original de Coucou (lib/tenti/trajes-coucou.ts), decisión del fundador
// del 6-oct-2026 («lo quiero exactamente como el original»). Por eso las
// comprobaciones de paleta corren sin traje, y las del traje, abajo, piden
// justo sus colores de Coucou (el blanco del pompón incluido).
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
    moveTo() {} lineTo() {} closePath() {} roundRect() {} quadraticCurveTo() {} bezierCurveTo() {} ellipse() {} arc() {} arcTo() {} rect() {} addPath() {}
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

/** `extra`: colores que ese estado puede pintar además de la paleta (el tinte
 *  del prototipo de los estados que no tienen token, la «z» de dormido). */
function comprobarPaleta(estado: EstadoTenti, extra: string[] = []) {
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
    ...[PALETA.cuerpo[0], PALETA.cuerpo[1], PALETA.tinta, PALETA.rubor, PALETA.chispa, PALETA.hecho, ...Object.values(PALETA.estados)].map(hexRgb),
    [0, 0, 0], [255, 255, 255], ...extra.map(aRgb),
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

// Los estados que el panel enseña desde el 5-oct (lib/tenti/momentos.ts):
// tiñen con los tokens de estado y nunca con un color del prototipo.
for (const [estado, token] of [
  ['trabajando', PALETA.estados.trabajando], ['error', PALETA.estados.error],
  ['esperaTuOk', PALETA.estados.esperaTuOk], ['agobiado', PALETA.estados.agobiado],
] as const) {
  test(`en '${estado}', con paleta: tinte del token, sin un color del prototipo`, () => {
    const pintados = comprobarPaleta(estado);
    assert.ok(pintados.some((c) => cerca(c, hexRgb(token))), `'${estado}' no tiñe con ${token}`);
  });
}
// 'dormido' y 'pregunta' conservan el tinte del prototipo (no son avisos), pero
// sus partículas y sus ojos tampoco pueden llevar los colores prohibidos.
test("en 'dormido' y 'pregunta', con paleta: ningún color prohibido", () => {
  comprobarPaleta('dormido', [ESTADOS.dormido.col, 'rgba(210,220,235,1)']);
  comprobarPaleta('pregunta', [ESTADOS.pregunta.col]);
});

test('amor y orgullo con paleta: corazones del rubor, estrellas de la chispa; la gota de agobiado, de --info', () => {
  const motor = crear({ paleta: PALETA, insignias: false });
  motor.emocion('amor', 1500, true);
  const amor = correr(motor, 1500).flat().map(aRgb);
  motor.emocion('orgullo', 1500, true);
  const orgullo = correr(motor, 1500).flat().map(aRgb);
  motor.ponerEstado('agobiado', { forzar: true, silencio: true });
  const agobiado = correr(motor, 1500).flat().map(aRgb);
  motor.destruir();
  for (const [nombre, pintados] of [['amor', amor], ['orgullo', orgullo], ['agobiado', agobiado]] as const) {
    for (const c of pintados) {
      for (const [prohibido, rgb] of PROHIBIDOS_RGB) assert.ok(!cerca(c, rgb), `${nombre} pinta ${prohibido}`);
    }
  }
  assert.ok(amor.some((c) => cerca(c, hexRgb(PALETA.rubor))), 'los corazones no salen del rubor');
  assert.ok(orgullo.some((c) => cerca(c, hexRgb(PALETA.chispa))), 'las estrellas no salen de la chispa');
  assert.ok(agobiado.some((c) => cerca(c, hexRgb(PALETA.estados.trabajando))), 'la gota no sale de --info');
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

test("'hecho' breve (celebra: false): el tinte y los ojos felices, sin girar ni chispas", () => {
  assert.deepEqual(animacionDeEntrada('hecho', false, false), ['parpadear']);
  assert.deepEqual(animacionDeEntrada('error', false, false), animacionDeEntrada('error', false), 'celebra solo cambia hecho');
  const motor = crear({ paleta: PALETA, insignias: false });
  motor.ponerEstado('hecho', { forzar: true, silencio: true, celebra: false });
  const roll = () => (motor as unknown as { s: { roll: number } }).s.roll;
  let maxRoll = 0;
  const pintados: RGB[] = [];
  for (const f of correr(motor, 1500)) { maxRoll = Math.max(maxRoll, Math.abs(roll())); pintados.push(...f.map(aRgb)); }
  motor.destruir();
  assert.equal(maxRoll, 0, 'el hecho breve ha girado');
  assert.ok(!pintados.some((c) => cerca(c, hexRgb(PALETA.chispa))), 'el hecho breve ha echado chispas');
  assert.ok(pintados.some((c) => cerca(c, hexRgb(PALETA.hecho))), 'el hecho breve no tiñe');
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

// ── El tope de lo que oscila (lib/tenti/momentos.ts, regla de §4) ──────────
//
// En lo diario un estado solo se mueve sin fin mientras dure algo que tiene fin
// y que la pantalla está esperando. Los que describen una situación oscilan
// 4 s y se quedan en su pose; la herramienta del asistente, 30 s; el catálogo,
// sin fin.

test("'situacion': esperaTuOk, dormido y buscando oscilan 4 s y el bucle se duerme", () => {
  for (const estado of ['esperaTuOk', 'dormido', 'buscando', 'agobiado'] as EstadoTenti[]) {
    const motor = crear({ paleta: PALETA, insignias: false, movimiento: 'situacion' });
    motor.ponerEstado(estado, { forzar: true, silencio: true });
    if (estado !== 'agobiado') assert.equal(motor.perpetuo(), true, `'${estado}' al entrar`);
    correr(motor, MOVIMIENTO_SITUACION_MS + 50);
    assert.equal(motor.perpetuo(), false, `'${estado}' sigue oscilando pasados 4 s`);
    // Y a partir de ahí duerme de verdad: muy por debajo de 60 fps.
    const r = vivir(motor, 20_000);
    motor.destruir();
    assert.ok(r.fotogramas < 400, `'${estado}': ${r.fotogramas} fotogramas en 20 s tras el tope`);
  }
});

test("'situacion': pasado el tope, cada estado se queda en su pose", () => {
  const s = (m: Tenti) => (m as unknown as { s: Record<string, number>; tg: Record<string, number> });
  const espera = crear({ paleta: PALETA, insignias: false, movimiento: 'situacion' });
  espera.ponerEstado('esperaTuOk', { forzar: true, silencio: true });
  correr(espera, MOVIMIENTO_SITUACION_MS + 1500);
  assert.ok(Math.abs(s(espera).s.oy) < 0.005, 'esperaTuOk sigue botando');
  espera.destruir();
  const dormido = crear({ paleta: PALETA, insignias: false, movimiento: 'situacion' });
  dormido.ponerEstado('dormido', { forzar: true, silencio: true });
  correr(dormido, MOVIMIENTO_SITUACION_MS + 1500);
  assert.ok(Math.abs(s(dormido).s.sy - 1) < 0.005, 'dormido sigue respirando');
  assert.ok(s(dormido).s.pitch < -0.1, 'dormido no baja la cabeza');
  dormido.destruir();
  // Fuera de mini, agobiado ya no echa gotas de ambiente.
  const agobiado = crear({ paleta: PALETA, insignias: false, movimiento: 'situacion' });
  agobiado.ponerEstado('agobiado', { forzar: true, silencio: true });
  correr(agobiado, MOVIMIENTO_SITUACION_MS + 2000);
  correr(agobiado, 5000);
  assert.equal((agobiado as unknown as { parts: unknown[] }).parts.length, 0, 'agobiado sigue sudando pasado el tope');
  agobiado.destruir();
});

test("'peticion' oscila 30 s, 'sinFin' mientras dure, y cambiar de estado vuelve a contar", () => {
  const peticion = crear({ paleta: PALETA, insignias: false, movimiento: 'peticion' });
  peticion.ponerEstado('buscando', { forzar: true, silencio: true });
  correr(peticion, MOVIMIENTO_SITUACION_MS + 100);
  assert.equal(peticion.perpetuo(), true, "'peticion' se ha cortado a los 4 s");
  reloj += MOVIMIENTO_PETICION_MS;
  assert.equal(peticion.perpetuo(), false, "'peticion' sigue pasados 30 s");
  peticion.ponerEstado('buscando', { forzar: true, silencio: true });
  assert.equal(peticion.perpetuo(), true, 'volver a pedirlo (otra herramienta) vuelve a armar el tope');
  peticion.destruir();
  const sinFin = crear({ paleta: PALETA, insignias: false });
  sinFin.ponerEstado('esperaTuOk', { forzar: true, silencio: true });
  reloj += 120_000;
  assert.equal(sinFin.perpetuo(), true, "'sinFin' (el catálogo) se ha cortado");
  sinFin.destruir();
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

test('con varios Tentis en la página, miran de uno en uno y no se pisan', () => {
  const motores = [0, 1, 2, 3].map(() => crear({ paleta: PALETA, insignias: false, miradas: true, mini: true }));
  const fuera = motores.map(() => false);
  let a_la_vez = 0, miradas = 0;
  for (let i = 0; i < 60_000 / 16; i++) {
    reloj += 16;
    mock.timers.tick(16);
    let mirando = 0;
    motores.forEach((m, k) => {
      m.fotograma();
      const y = Math.abs(yaw(m));
      if (y > 0.15 && !fuera[k]) { fuera[k] = true; miradas++; } else if (y < 0.02) fuera[k] = false;
      if (y > 0.15) mirando++;
    });
    if (mirando > 1) a_la_vez++;
  }
  for (const m of motores) m.destruir();
  assert.equal(a_la_vez, 0, 'dos Tentis mirando a los lados a la vez');
  assert.ok(miradas >= 4, `solo ${miradas} miradas en 60 s entre cuatro Tentis: parecen de piedra`);
  // Cada uno a su aire serían ~8 por cabeza en 60 s (32): con turnos, como mucho una cada ~5 s.
  assert.ok(miradas <= 14, `${miradas} miradas en 60 s: no se están turnando`);
});

test('al destruirse mirando, suelta el turno: el siguiente no se queda esperando', () => {
  const a = crear({ paleta: PALETA, insignias: false, miradas: true, mini: true });
  const b = crear({ paleta: PALETA, insignias: false, miradas: true, mini: true });
  let i = 0;
  while (Math.abs(yaw(a)) < 0.15 && i++ < 20_000 / 16) { correr(a, 16); }
  assert.ok(Math.abs(yaw(a)) >= 0.15, 'a no ha llegado a mirar');
  a.destruir();
  let maximo = 0;
  for (let j = 0; j < 12_000 / 16; j++) { correr(b, 16); maximo = Math.max(maximo, Math.abs(yaw(b))); }
  b.destruir();
  assert.ok(maximo > 0.2, 'el turno se ha quedado cogido por un Tenti desmontado');
});

test('a medio ritmo solo el ambiente: un estado, una emoción o el cursor van a ritmo completo', () => {
  const m = crear({ paleta: PALETA, insignias: false, miradas: true, mini: true });
  correr(m, 3_000);
  assert.equal(m.aMedioRitmo(), true, 'en reposo, ya asentado, debería ir a medio ritmo');
  m.ponerEstado('hecho', { forzar: true, silencio: true });
  assert.equal(m.aMedioRitmo(), false, 'recién cambiado de estado va a medio ritmo');
  correr(m, 6_000);
  m.ponerEstado('reposo', { forzar: true, silencio: true });
  correr(m, 3_000);
  m.emocion('guino', 1200, true);
  assert.equal(m.aMedioRitmo(), false, 'con una emoción en curso va a medio ritmo');
  correr(m, 3_000);
  assert.equal(m.aMedioRitmo(), true);
  m.mira.x = 0.8;
  correr(m, 16);
  assert.equal(m.aMedioRitmo(), false, 'siguiendo al cursor va a medio ritmo');
  m.destruir();
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

// ── El traje: los de Coucou ─────────────────────────────────────────────────
//
// El dibujo de cada traje lo prueba trajes-coucou.test.ts; aquí, cómo lo monta
// el motor: lo de detrás antes del cuerpo y lo de delante después de cuerpo y
// ojos, todo DENTRO de la transformación del cuerpo (así se aplasta y se ladea
// con él), el lienzo que crece con traje y la física de lo que cuelga.

/** Un contexto que apunta, en orden, save/restore/scale y cada color (de
 *  relleno, de trazo o parada de un degradado). */
function contextoQueApunta(eventos: string[]): CanvasRenderingContext2D {
  const degradado = () => ({ addColorStop: (_: number, c: string) => { eventos.push(`color:${c}`); } });
  const campos: Record<string | symbol, unknown> = {};
  return new Proxy(campos, {
    get(t, k) {
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return degradado;
      if (k === 'save' || k === 'restore' || k === 'scale') return () => { eventos.push(String(k)); };
      if (k in t) return t[k];
      return () => {};
    },
    set(t, k, v) {
      if ((k === 'fillStyle' || k === 'strokeStyle') && typeof v === 'string') eventos.push(`color:${v}`);
      t[k] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

function motorQueApunta(eventos: string[], opciones: ConstructorParameters<typeof Tenti>[1]) {
  const canvas = { width: 0, height: 0, getContext: () => contextoQueApunta(eventos) } as unknown as HTMLCanvasElement;
  const motor = new Tenti(canvas, opciones);
  motor.medir(120);
  return { motor, canvas };
}

test('con el gorro de bruja: el ala de detrás antes del cuerpo, el gorro después de los ojos, todo dentro de la transformación del cuerpo', () => {
  const eventos: string[] = [];
  const { motor } = motorQueApunta(eventos, { paleta: PALETA, insignias: false, traje: 'bruja' });
  eventos.length = 0;
  motor.fotograma();
  motor.destruir();
  // Dónde está cada cosa en el fotograma, y a qué profundidad de save().
  let prof = 0, profCuerpo = -1;
  const sitio = new Map<string, { i: number; dentro: boolean }>();
  eventos.forEach((e, i) => {
    if (e === 'save') prof++;
    else if (e === 'restore') prof--;
    else if (e === 'scale' && profCuerpo < 0) profCuerpo = prof;
    else if (e.startsWith('color:') && !sitio.has(e.slice(6))) sitio.set(e.slice(6), { i, dentro: profCuerpo > 0 && prof >= profCuerpo });
  });
  const ver = (c: string) => { const v = sitio.get(c); assert.ok(v, `no se pinta ${c}`); return v; };
  const alaDetras = ver('#2A0A4F'), cuerpo = ver('rgba(255,250,245,1)'), ojos = ver(PALETA.tinta);
  const cono = ver('#7C3AED'), banda = ver('#F97316'), hebilla = ver('#FCD34D');
  assert.ok(alaDetras.i < cuerpo.i, 'el ala de detrás va antes que el cuerpo');
  for (const [nombre, v] of [['cono', cono], ['banda', banda], ['hebilla', hebilla]] as const) {
    assert.ok(v.i > ojos.i, `el ${nombre} va después de los ojos`);
  }
  for (const [nombre, v] of [['ala', alaDetras], ['cono', cono], ['banda', banda], ['hebilla', hebilla]] as const) {
    assert.ok(v.dentro, `${nombre}: fuera de la transformación del cuerpo, no se aplastaría con él`);
  }
});

test('los colores del traje son los del original de Coucou; sin traje no hay ninguno', () => {
  const colores = (opciones: ConstructorParameters<typeof Tenti>[1]) => {
    const motor = crear(opciones);
    const pintados = correr(motor, 64).flat().map(aRgb);
    motor.destruir();
    return pintados;
  };
  const DE_COUCOU = ['#5B21B6', '#7C3AED', '#2E1065', '#F97316', '#FCD34D', '#C2410C'];
  const con = colores({ paleta: PALETA, insignias: false, traje: 'bruja' });
  for (const c of DE_COUCOU) assert.ok(con.some((p) => cerca(p, hexRgb(c))), `el gorro de bruja no usa ${c}, el del original`);
  const sin = colores({ paleta: PALETA, insignias: false });
  for (const c of DE_COUCOU) assert.ok(!sin.some((p) => cerca(p, hexRgb(c))), `sin traje se pinta ${c}`);
});

test('la calabaza recolorea el cuerpo con sus colores; los demás trajes, no', () => {
  const cuerpo = (traje: 'calabaza' | 'bruja') => {
    const motor = crear({ paleta: PALETA, insignias: false, traje });
    const pintados = correr(motor, 32).flat().map(aRgb);
    motor.destruir();
    return pintados;
  };
  const calabaza = cuerpo('calabaza');
  assert.ok(calabaza.some((p) => cerca(p, hexRgb('#FFA94D'))) && calabaza.some((p) => cerca(p, hexRgb('#E8590C'))));
  assert.ok(!calabaza.some((p) => cerca(p, hexRgb(PALETA.cuerpo[0]))), 'con calabaza, el cuerpo sigue crema');
  assert.ok(cuerpo('bruja').some((p) => cerca(p, hexRgb(PALETA.cuerpo[0]))), 'con gorro, el cuerpo es el de siempre');
});

test('con traje el lienzo crece (lienzoDeTenti), y se vuelve a medir al ponérselo y al quitárselo', () => {
  const eventos: string[] = [];
  const { motor, canvas } = motorQueApunta(eventos, { paleta: PALETA, insignias: false });
  assert.deepEqual([canvas.width, canvas.height], [120, 120]);
  motor.traje = 'bruja';
  const l = lienzoDeTenti(120, true);
  assert.deepEqual([canvas.width, canvas.height], [Math.round(l.ancho), Math.round(l.alto)]);
  assert.ok(canvas.height > 120 && canvas.width > 120);
  motor.traje = null;
  assert.deepEqual([canvas.width, canvas.height], [120, 120]);
  motor.destruir();
});

const fisica = (m: Tenti) => (m as unknown as { fis: { dx: number; dy: number } }).fis;

test('lo que cuelga del traje se queda atrás al girar, rebota y se asienta; con «reducir movimiento», sin muelle', () => {
  const motor = crear({ paleta: PALETA, insignias: false, traje: 'bruja', miradas: false });
  correr(motor, 500);
  assert.ok(Math.abs(fisica(motor).dx) < 0.01, 'quieto al frente, la física en reposo');
  motor.mira.x = 1; // gira la cabeza a la derecha
  let minimo = 0;
  const hasta = reloj + 3000;
  while (reloj < hasta) { correr(motor, 16); minimo = Math.min(minimo, fisica(motor).dx); }
  const asentado = fisica(motor).dx;
  // Girada a la derecha cuelga hacia la izquierda (dx < 0), como «R» en sheet.html.
  assert.ok(asentado < -0.5, `asentado en ${asentado.toFixed(3)}`);
  assert.ok(minimo < asentado - 0.02, `no rebota: mínimo ${minimo.toFixed(3)}, asentado ${asentado.toFixed(3)}`);
  // Asentado de verdad: sin velocidad y donde la deja la cabeza (sheet.html: R → dx -0,6 con yaw 0,5).
  const v = (motor as unknown as { vfis: { dx: number; dy: number } }).vfis;
  assert.ok(Math.abs(v.dx) + Math.abs(v.dy) < 0.01, 'tres segundos después aún rebota');
  const yaw = (motor as unknown as { s: { yaw: number } }).s.yaw;
  assert.ok(Math.abs(asentado - -1.2 * yaw) < 0.01, `asentado en ${asentado.toFixed(3)} con la cabeza a ${yaw.toFixed(3)}`);
  motor.destruir();

  // Aplastarlo lanza arriba lo que cuelga (dy < 0)…
  const vivo = crear({ paleta: PALETA, insignias: false, traje: 'bruja', miradas: false });
  correr(vivo, 300);
  vivo.aplastar();
  let arriba = 0;
  for (let t = 0; t < 600; t += 16) { correr(vivo, 16); arriba = Math.min(arriba, fisica(vivo).dy); }
  assert.ok(arriba < -0.1, `al aplastarlo, dy llega a ${arriba.toFixed(3)}`);
  vivo.destruir();
  // …y con «reducir movimiento», ni se aplasta ni se mueve nada.
  const quieto = crear({ paleta: PALETA, insignias: false, traje: 'bruja', quieto: true });
  quieto.aplastar();
  for (let t = 0; t < 400; t += 16) { correr(quieto, 16); const f = fisica(quieto); assert.ok(Math.abs(f.dx) + Math.abs(f.dy) === 0, 'con «reducir movimiento» no rebota'); }
  quieto.destruir();
});

test('una pose fija (la hoja de /interno) manda sobre la cabeza y la física', () => {
  const pose = { yaw: -0.5, pitch: 0.4, tilt: 0.12, fisica: { dx: 0.6, dy: -0.4 } };
  const motor = crear({ paleta: PALETA, insignias: false, traje: 'bruja', pose });
  motor.mira.x = 1;
  correr(motor, 200);
  const s = (motor as unknown as { s: { yaw: number; pitch: number; tilt: number } }).s;
  assert.deepEqual([s.yaw, s.pitch, s.tilt], [-0.5, 0.4, 0.12]);
  assert.deepEqual(fisica(motor), { dx: 0.6, dy: -0.4 });
  // Es una lámina, como sheet.html: no parpadea ni pide despertarse.
  const abierto = (motor as unknown as { s: { open: number } }).s;
  for (let t = 0; t < 8000; t += 16) { correr(motor, 16); assert.equal(abierto.open, 1, 'con pose fija parpadea'); }
  assert.equal(motor.proximoDespertar(), Infinity);
  motor.destruir();
});

test('cada traje se pinta en el motor sin lanzar, en cualquier estado', () => {
  for (const traje of ['gorroDeLana', 'papaNoel', 'fiesta', 'corona', 'bruja', 'gafasDeSol', 'gafasRedondas', 'bufanda', 'calabaza', 'lazo'] as const) {
    for (const estado of Object.keys(ESTADOS) as EstadoTenti[]) {
      const motor = crear({ paleta: PALETA, insignias: true, traje });
      motor.ponerEstado(estado, { forzar: true, silencio: true });
      assert.doesNotThrow(() => correr(motor, 400), `${traje} en '${estado}'`);
      motor.destruir();
    }
  }
});
