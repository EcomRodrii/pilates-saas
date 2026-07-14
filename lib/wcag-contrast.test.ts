import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hexARgb,
  luminanciaRelativa,
  ratioContraste,
  cumpleContraste,
} from './wcag-contrast.ts';

test('hexARgb parsea #RRGGBB', () => {
  assert.deepEqual(hexARgb('#FFFFFF'), { r: 255, g: 255, b: 255 });
  assert.deepEqual(hexARgb('000000'), { r: 0, g: 0, b: 0 });
  assert.deepEqual(hexARgb('#4F46E5'), { r: 79, g: 70, b: 229 });
});

test('hexARgb expande shorthand #RGB y #RGBA', () => {
  assert.deepEqual(hexARgb('#fff'), { r: 255, g: 255, b: 255 });
  assert.deepEqual(hexARgb('#f00a'), { r: 255, g: 0, b: 0 });
});

test('hexARgb ignora el alfa en #RRGGBBAA', () => {
  assert.deepEqual(hexARgb('#4F46E580'), { r: 79, g: 70, b: 229 });
});

test('hexARgb devuelve null para formatos inválidos', () => {
  assert.equal(hexARgb('#12'), null);
  assert.equal(hexARgb('#GGGGGG'), null);
  assert.equal(hexARgb('rgb(0,0,0)'), null);
  assert.equal(hexARgb(''), null);
});

test('luminanciaRelativa: negro=0, blanco=1', () => {
  assert.equal(luminanciaRelativa({ r: 0, g: 0, b: 0 }), 0);
  assert.equal(luminanciaRelativa({ r: 255, g: 255, b: 255 }), 1);
});

test('ratioContraste blanco/negro = 21', () => {
  const r = ratioContraste('#FFFFFF', '#000000');
  assert.ok(r !== null && Math.abs(r - 21) < 1e-9);
});

test('ratioContraste mismo color = 1', () => {
  assert.equal(ratioContraste('#777777', '#777777'), 1);
});

test('ratioContraste es simétrico', () => {
  assert.equal(
    ratioContraste('#4F46E5', '#FFFFFF'),
    ratioContraste('#FFFFFF', '#4F46E5'),
  );
});

test('ratioContraste null si algún color es inválido', () => {
  assert.equal(ratioContraste('#zzz', '#000'), null);
});

test('cumpleContraste AA normal: negro sobre blanco pasa, gris claro no', () => {
  assert.equal(cumpleContraste('#000000', '#FFFFFF'), true);
  assert.equal(cumpleContraste('#AAAAAA', '#FFFFFF'), false); // ~2.32:1
});

test('cumpleContraste: texto grande tiene umbral más laxo', () => {
  // #767676 sobre blanco ≈ 4.54:1 → pasa AA normal y grande.
  // #949494 sobre blanco ≈ 3.03:1 → falla AA normal, pasa AA grande.
  assert.equal(cumpleContraste('#949494', '#FFFFFF', { grande: false }), false);
  assert.equal(cumpleContraste('#949494', '#FFFFFF', { grande: true }), true);
});

test('cumpleContraste: AAA es más estricto que AA', () => {
  // #595959 sobre blanco ≈ 7.0:1 (justo AAA). Un gris más claro pasa AA pero no AAA.
  assert.equal(cumpleContraste('#767676', '#FFFFFF', { nivel: 'AA' }), true);
  assert.equal(cumpleContraste('#767676', '#FFFFFF', { nivel: 'AAA' }), false);
});

test('cumpleContraste: fail-safe en color inválido → false', () => {
  assert.equal(cumpleContraste('#nope', '#FFFFFF'), false);
});
