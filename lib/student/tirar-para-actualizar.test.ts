import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOPE_PX, UMBRAL_PX, distanciaConResistencia, esTironVertical, sueltaYRecarga } from './tirar-para-actualizar.ts';

test('distanciaConResistencia: crece con el dedo, cada vez menos, y nunca pasa del tope', () => {
  assert.equal(distanciaConResistencia(0), 0);
  assert.equal(distanciaConResistencia(-40), 0);
  assert.equal(distanciaConResistencia(Number.NaN), 0);
  const a = distanciaConResistencia(60);
  const b = distanciaConResistencia(120);
  const c = distanciaConResistencia(180);
  assert.ok(a > 0 && b > a && c > b);
  assert.ok(b - a > c - b, 'cada vez cuesta más bajarlo');
  assert.ok(distanciaConResistencia(10_000) <= TOPE_PX);
});

test('sueltaYRecarga: un tirón corto no recarga; uno largo, sí', () => {
  assert.equal(sueltaYRecarga(distanciaConResistencia(40)), false);
  assert.equal(sueltaYRecarga(distanciaConResistencia(300)), true);
  assert.equal(sueltaYRecarga(UMBRAL_PX), true);
});

test('esTironVertical: pasar los días de lado no es tirar para actualizar', () => {
  assert.equal(esTironVertical(2, 12), true);
  assert.equal(esTironVertical(30, 12), false);
  assert.equal(esTironVertical(0, -12), false);
});
