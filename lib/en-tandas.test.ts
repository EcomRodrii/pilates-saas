import test from 'node:test';
import assert from 'node:assert/strict';
import { enTandas } from './en-tandas.ts';

const dormir = (ms: number) => new Promise(r => setTimeout(r, ms));

test('enTandas: mismo resultado y mismo orden que Promise.all', async () => {
  const r = await enTandas([1, 2, 3, 4, 5, 6, 7], 3, async x => { await dormir(7 - x); return x * 10; });
  assert.deepEqual(r, [10, 20, 30, 40, 50, 60, 70]);
});

test('enTandas: nunca hay más de `tamano` llamadas a la vez', async () => {
  let vivas = 0, maxVivas = 0;
  await enTandas(Array.from({ length: 23 }, (_, i) => i), 5, async () => {
    vivas++; maxVivas = Math.max(maxVivas, vivas);
    await dormir(2); vivas--;
  });
  assert.equal(maxVivas, 5);
});

test('enTandas: el índice que recibe fn es el de la lista entera', async () => {
  const r = await enTandas(['a', 'b', 'c', 'd', 'e'], 2, async (x, i) => `${i}${x}`);
  assert.deepEqual(r, ['0a', '1b', '2c', '3d', '4e']);
});

test('enTandas: lista vacía, y un error se propaga sin lanzar las tandas siguientes', async () => {
  assert.deepEqual(await enTandas([], 4, async x => x), []);
  const lanzadas: number[] = [];
  await assert.rejects(enTandas([1, 2, 3, 4, 5, 6], 2, async x => { lanzadas.push(x); if (x === 3) throw new Error('boom'); return x; }), /boom/);
  assert.deepEqual(lanzadas, [1, 2, 3, 4]);
});

test('enTandas: un tamaño inválido falla a la vista, no se queda colgado', async () => {
  await assert.rejects(enTandas([1], 0, async x => x), /tamaño/);
});
