import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOAST_MAX_MS, TOAST_MIN_MS, duracionToast } from './toast-duracion.ts';

test('duracionToast: lo de siempre para un texto corto, más para uno largo, con techo', () => {
  assert.equal(duracionToast('Hecho ✓'), TOAST_MIN_MS);
  assert.equal(duracionToast(''), TOAST_MIN_MS);
  const largo = 'Alguien se te adelantó por segundos — te hemos dado una clase de recuperación.';
  assert.equal(duracionToast(largo), Array.from(largo).length * 60);
  assert.ok(duracionToast(largo) > TOAST_MIN_MS);
  assert.equal(duracionToast('x'.repeat(500)), TOAST_MAX_MS);
});
