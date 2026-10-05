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
