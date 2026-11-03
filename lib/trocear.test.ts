import test from 'node:test';
import assert from 'node:assert/strict';
import { trocear } from './trocear.ts';

test('trocea sin perder ni repetir nada, y el último trozo es el resto', () => {
  const ids = Array.from({ length: 1173 }, (_, i) => `ses-${i}`);
  const t = trocear(ids, 150);
  assert.equal(t.length, 8);
  assert.ok(t.every((x) => x.length <= 150));
  assert.deepEqual(t.flat(), ids);
});

test('lista vacía = ningún trozo; menos que el tamaño = uno solo', () => {
  assert.deepEqual(trocear([], 10), []);
  assert.deepEqual(trocear(['a', 'b'], 10), [['a', 'b']]);
});

test('un tamaño inválido falla en vez de colgarse', () => {
  assert.throws(() => trocear(['a'], 0));
  assert.throws(() => trocear(['a'], Number.NaN));
});
