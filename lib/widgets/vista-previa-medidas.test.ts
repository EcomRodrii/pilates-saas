import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ANCHO_ESCRITORIO, ANCHO_MOVIL, ESCALA_LEGIBLE, anchoLienzo, medidasLienzo,
} from './vista-previa-medidas.ts';

// Anchos de columna de verdad: el iPad en vertical dentro de una hoja (~330),
// la columna a 1280 y a 1440 (~420–470), un portátil grande y la hoja de
// «Ver a tamaño real» a 1440 (~1340).
const COLUMNAS = [0, 280, 330, 390, 420, 448, 470, 520, 700, 900, 1100, 1340, 1600];

test('legible: en «Ordenador» la escala NUNCA baja de la que se lee', () => {
  for (const disponible of COLUMNAS) {
    for (const anchoWidget of [null, 480, 720]) {
      const m = medidasLienzo('escritorio', anchoWidget, disponible, 'legible');
      assert.ok(m.escala >= ESCALA_LEGIBLE, `columna ${disponible}, widget ${anchoWidget}: escala ${m.escala}`);
      assert.ok(m.escala <= 1);
    }
  }
});

test('legible: a 1440 (columna ~448) la ventana de ordenador cabe a 0,75 casi justa, y la letra de 15 px se queda en 11', () => {
  const m = medidasLienzo('escritorio', null, 448, 'legible');
  assert.equal(m.ancho, 600);
  assert.equal(m.escala, ESCALA_LEGIBLE);
  assert.ok(15 * m.escala >= 11);
  // 600 × 0,75 = 450: dos píxeles de más se dejan desplazar, no se encoge.
  assert.equal(m.desborda, true);
  const holgada = medidasLienzo('escritorio', null, 470, 'legible');
  assert.equal(holgada.desborda, false);
  assert.ok(holgada.ancho * holgada.escala <= 470);
});

test('legible: el móvil va a tamaño real (1) en cuanto cabe, y escalado solo si no', () => {
  assert.deepEqual(medidasLienzo('movil', null, 418, 'legible'), { ancho: ANCHO_MOVIL, escala: 1, desborda: false });
  assert.deepEqual(medidasLienzo('movil', null, 390, 'legible'), { ancho: ANCHO_MOVIL, escala: 1, desborda: false });
  const estrecho = medidasLienzo('movil', null, 330, 'legible');
  assert.ok(estrecho.escala < 1 && estrecho.escala > 0.8);
  assert.equal(estrecho.desborda, false);
});

test('legible: ordenador y móvil nunca se pintan al mismo ancho', () => {
  for (const disponible of COLUMNAS) {
    const o = medidasLienzo('escritorio', null, disponible, 'legible');
    const m = medidasLienzo('movil', null, disponible, 'legible');
    assert.ok(o.ancho - m.ancho >= 200, `columna ${disponible}: ${o.ancho} frente a ${m.ancho}`);
  }
});

test('nunca más ancho que una web de 1200, en ninguna medida', () => {
  for (const disponible of COLUMNAS) {
    for (const medidas of ['v1', 'legible', 'real'] as const) {
      for (const d of ['escritorio', 'movil'] as const) {
        assert.ok(medidasLienzo(d, 480, disponible, medidas).ancho <= ANCHO_ESCRITORIO);
      }
    }
  }
});

test('real: la web de 1200 entera, a 1 si cabe', () => {
  assert.deepEqual(medidasLienzo('escritorio', 480, 1340, 'real'), { ancho: 1200, escala: 1, desborda: false });
  const m = medidasLienzo('escritorio', null, 900, 'real');
  assert.equal(m.ancho, 1200);
  assert.equal(m.escala, 0.75);
});

test('sin medir todavía (0): a 1, como siempre', () => {
  assert.equal(medidasLienzo('escritorio', null, 0, 'legible').escala, 1);
  assert.equal(medidasLienzo('movil', null, 0, 'v1').escala, 1);
});

test('v1: la medida de siempre, sin tocar (lo vigila también widget-builder.spec.ts)', () => {
  assert.equal(anchoLienzo('movil', null), 390);
  assert.equal(anchoLienzo('escritorio', null), 1200);
  assert.equal(anchoLienzo('escritorio', 480), 760);
  assert.equal(anchoLienzo('escritorio', 1000), 1200);
  // La escala de siempre: lo que quepa, también por debajo de 0,75 (el hallazgo que arregla 'legible').
  const v1 = medidasLienzo('escritorio', null, 448, 'v1');
  assert.equal(v1.ancho, 1200);
  assert.ok(Math.abs(v1.escala - 448 / 1200) < 1e-9);
  assert.equal(v1.desborda, false);
});
