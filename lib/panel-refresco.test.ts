import { test } from 'node:test';
import assert from 'node:assert/strict';

import { debeReleerAlVolver, OCULTA_MINIMO_MS } from './panel-refresco.ts';

test('sin constancia de haberse ocultado, no relee', () => {
  assert.equal(debeReleerAlVolver(null, 1_000_000), false);
});

test('un vistazo a otra pestaña no dispara consultas', () => {
  assert.equal(debeReleerAlVolver(1_000_000, 1_000_000 + 5_000), false);
});

test('oculta el tiempo mínimo o más, relee', () => {
  assert.equal(debeReleerAlVolver(1_000_000, 1_000_000 + OCULTA_MINIMO_MS), true);
  assert.equal(debeReleerAlVolver(1_000_000, 1_000_000 + 10 * 60_000), true);
});
