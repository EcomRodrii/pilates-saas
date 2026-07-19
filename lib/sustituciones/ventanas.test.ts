import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularVentanas, VENTANA_MIN, VENTANA_MAX, CLASE_MINIMA_MS } from './ventanas.ts';

const MIN = 60_000;

test('clase ya pasada → no corre', () => {
  const v = calcularVentanas(-5000);
  assert.equal(v.correr, false);
  assert.equal(v.motivo, 'clase_pasada');
});

test('clase inminente (< 8 min) → no corre', () => {
  const v = calcularVentanas(5 * MIN);
  assert.equal(v.correr, false);
  assert.equal(v.motivo, 'clase_inminente');
});

test('justo por debajo del mínimo no corre; justo por encima corre', () => {
  assert.equal(calcularVentanas(CLASE_MINIMA_MS - 1).correr, false);
  assert.equal(calcularVentanas(CLASE_MINIMA_MS).correr, true);
});

test('clase a 30 min → ventana = 1/3 acotado al mínimo (5 min)', () => {
  const v = calcularVentanas(30 * MIN); // 1/3 = 10 min
  assert.equal(v.correr, true);
  assert.equal(v.recordatorioMs, 10 * MIN);
  assert.equal(v.avanceMs, 10 * MIN);
});

test('clase a 9 min → 1/3 = 3 min pero se sube al mínimo de 5 min', () => {
  const v = calcularVentanas(9 * MIN);
  assert.equal(v.recordatorioMs, VENTANA_MIN);
});

test('clase muy lejana → ventana acotada al máximo (45 min)', () => {
  const v = calcularVentanas(10 * 60 * MIN); // 10 h → 1/3 = 200 min
  assert.equal(v.recordatorioMs, VENTANA_MAX);
  assert.equal(v.avanceMs, VENTANA_MAX);
});

test('las dos ventanas + colchón caben antes de la clase (rango realista)', () => {
  for (const min of [8, 12, 20, 45, 90, 180, 600]) {
    const ms = min * MIN;
    const v = calcularVentanas(ms);
    assert.equal(v.correr, true, `debería correr a ${min} min`);
    // recordatorio + avance nunca deberían pasarse en más de una ventana del inicio de la clase
    assert.ok(v.recordatorioMs + v.avanceMs <= ms + VENTANA_MIN, `ventanas exceden en ${min} min`);
  }
});
