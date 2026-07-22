import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conCacheCatalogo, invalidarCacheCatalogo } from './catalogo-estudio.ts';

test('primera llamada carga y cachea; la segunda no vuelve a llamar a cargar()', async () => {
  const clave = `test-${Math.random()}`;
  let llamadas = 0;
  const cargar = async () => { llamadas++; return { valor: 'a' }; };

  const r1 = await conCacheCatalogo(clave, cargar, 10_000);
  const r2 = await conCacheCatalogo(clave, cargar, 10_000);

  assert.equal(llamadas, 1);
  assert.deepEqual(r1, { valor: 'a' });
  assert.deepEqual(r2, { valor: 'a' });
});

test('tras expirar el TTL, vuelve a llamar a cargar()', async () => {
  const clave = `test-${Math.random()}`;
  let llamadas = 0;
  const cargar = async () => { llamadas++; return llamadas; };

  const r1 = await conCacheCatalogo(clave, cargar, 5);
  await new Promise((r) => setTimeout(r, 15));
  const r2 = await conCacheCatalogo(clave, cargar, 5);

  assert.equal(llamadas, 2);
  assert.equal(r1, 1);
  assert.equal(r2, 2);
});

test('claves distintas no comparten caché entre sí', async () => {
  let llamadasA = 0, llamadasB = 0;
  const a = await conCacheCatalogo(`claveA-${Math.random()}`, async () => { llamadasA++; return 'a'; }, 10_000);
  const b = await conCacheCatalogo(`claveB-${Math.random()}`, async () => { llamadasB++; return 'b'; }, 10_000);

  assert.equal(llamadasA, 1);
  assert.equal(llamadasB, 1);
  assert.equal(a, 'a');
  assert.equal(b, 'b');
});

test('invalidarCacheCatalogo fuerza una recarga aunque el TTL no haya expirado', async () => {
  const clave = `test-${Math.random()}`;
  let llamadas = 0;
  const cargar = async () => { llamadas++; return llamadas; };

  await conCacheCatalogo(clave, cargar, 10_000);
  invalidarCacheCatalogo(clave);
  const r2 = await conCacheCatalogo(clave, cargar, 10_000);

  assert.equal(llamadas, 2);
  assert.equal(r2, 2);
});

test('invalidar una clave que no existe no lanza', () => {
  assert.doesNotThrow(() => invalidarCacheCatalogo(`no-existe-${Math.random()}`));
});
