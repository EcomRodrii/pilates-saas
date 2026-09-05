import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CacheSesion, claveSesion } from './sesion-cache.ts';

test('dos instancias que piden a la vez comparten UNA carga', async () => {
  const c = new CacheSesion<string>(30_000);
  let cargas = 0;
  const cargar = () => new Promise<string>((res) => { cargas++; setTimeout(() => res('socia-1'), 5); });
  const [a, b, d] = await Promise.all([c.obtener('k', cargar, 0), c.obtener('k', cargar, 0), c.obtener('k', cargar, 0)]);
  assert.deepEqual([a, b, d], ['socia-1', 'socia-1', 'socia-1']);
  assert.equal(cargas, 1);
});

test('dentro del TTL no vuelve a cargar; pasado el TTL sí', async () => {
  const c = new CacheSesion<string>(1000);
  let cargas = 0;
  const cargar = async () => { cargas++; return 'x'; };
  await c.obtener('k', cargar, 0);
  await c.obtener('k', cargar, 500);
  assert.equal(cargas, 1);
  await c.obtener('k', cargar, 1500);
  assert.equal(cargas, 2);
});

test('forzar ignora lo guardado (tras login o alta) y actualiza la caché', async () => {
  const c = new CacheSesion<string>(30_000);
  let n = 0;
  const cargar = async () => `v${++n}`;
  assert.equal(await c.obtener('k', cargar, 0), 'v1');
  assert.equal(await c.obtener('k', cargar, 1, true), 'v2');
  assert.equal(await c.obtener('k', cargar, 2), 'v2');
});

test('una carga fallida no se queda pegada: la siguiente vuelve a intentar', async () => {
  const c = new CacheSesion<string>(30_000);
  let n = 0;
  const cargar = async () => { n++; if (n === 1) throw new Error('red'); return 'ok'; };
  await assert.rejects(c.obtener('k', cargar, 0));
  assert.equal(await c.obtener('k', cargar, 1), 'ok');
});

test('claves distintas por estudio y por usuario; vaciar lo tira todo', async () => {
  const c = new CacheSesion<string>(30_000);
  await c.obtener(claveSesion('', 'a', 'u1'), async () => 'a-u1', 0);
  await c.obtener(claveSesion('', 'b', 'u1'), async () => 'b-u1', 0);
  await c.obtener(claveSesion('', 'a', 'u2'), async () => 'a-u2', 0);
  assert.equal(c.tamano(), 3);
  c.vaciar();
  assert.equal(c.tamano(), 0);
});

test('tres forzados a la vez = UNA carga (el vuelo forzado se comparte)', async () => {
  const c = new CacheSesion<string>(30_000);
  let cargas = 0;
  const cargar = () => new Promise<string>((res) => { cargas++; setTimeout(() => res('v'), 5); });
  await Promise.all([c.obtener('k', cargar, 0, true), c.obtener('k', cargar, 0, true), c.obtener('k', cargar, 0, true)]);
  assert.equal(cargas, 1);
});

test('un vuelo lento previo no pisa al forzado más nuevo', async () => {
  const c = new CacheSesion<string>(30_000);
  const lento = new Promise<string>((res) => setTimeout(() => res('viejo'), 30));
  const p1 = c.obtener('k', () => lento, 0);
  const p2 = c.obtener('k', async () => 'nuevo', 1, true);
  assert.equal(await p2, 'nuevo');
  await p1;
  assert.equal(await c.obtener('k', async () => 'no-se-llama', 2), 'nuevo');
});
