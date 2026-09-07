import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unaVez } from './una-vez.ts';

// `unaVez` decide por `typeof window`, así que en `node --test` (donde no hay
// window) hay que fingirlo para poder probar la rama del navegador — y la
// AUSENCIA de window es justo la otra mitad de lo que se prueba aquí.
function enElNavegador<T>(hacer: () => T): T {
  const g = globalThis as unknown as { window?: unknown };
  const antes = 'window' in g;
  g.window = {};
  try { return hacer(); } finally { if (!antes) delete g.window; }
}

test('en el navegador, dos llamadas simultáneas comparten una sola petición', async () => {
  let veces = 0;
  const { a, b } = enElNavegador(() => {
    const hacer = async () => { veces += 1; await new Promise(r => setTimeout(r, 10)); return veces; };
    return { a: unaVez('k', hacer), b: unaVez('k', hacer) };
  });
  assert.equal(await a, 1);
  assert.equal(await b, 1);
  assert.equal(veces, 1);
});

test('cuando la primera termina, la siguiente vuelve a pedir: es dedupe, no caché', async () => {
  let veces = 0;
  const hacer = async () => { veces += 1; return veces; };
  await enElNavegador(() => unaVez('k2', hacer));
  await enElNavegador(() => unaVez('k2', hacer));
  assert.equal(veces, 2);
});

test('un fallo suelta la entrada — nadie se queda pegado a una promesa rechazada', async () => {
  let veces = 0;
  const hacer = async () => { veces += 1; throw new Error('no'); };
  await assert.rejects(() => enElNavegador(() => unaVez('k3', hacer)));
  await assert.rejects(() => enElNavegador(() => unaVez('k3', hacer)));
  assert.equal(veces, 2);
});

// ⚠️ La prueba que de verdad importa: un `Map` de módulo en el SERVIDOR lo
// comparten peticiones de personas distintas. Compartir ahí una promesa es
// servirle a una usuaria los datos de otra — el fallo que este repo ya pagó una
// vez con una caché por slug.
test('en el servidor NO se comparte nada: cada llamada hace la suya', async () => {
  const g = globalThis as unknown as { window?: unknown };
  assert.equal('window' in g, false, 'este test exige que no haya window');
  let veces = 0;
  const hacer = async () => { veces += 1; await new Promise(r => setTimeout(r, 10)); return veces; };
  await Promise.all([unaVez('k4', hacer), unaVez('k4', hacer)]);
  assert.equal(veces, 2);
});
