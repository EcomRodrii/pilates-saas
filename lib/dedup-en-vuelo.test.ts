import { test } from 'node:test';
import assert from 'node:assert/strict';

// ─────────────────────────────────────────────────────────────────────────────
// El deduplicador de peticiones en vuelo de lib/api-client.ts.
//
// No se importa de ahí porque ese módulo arrastra el cliente de Supabase y solo
// resuelve bajo el bundler de Next. Se replica el helper tal cual y se prueba su
// contrato, que es lo que importa: qué garantiza y qué NO.
//
// La propiedad crítica es que NO es una caché. Si alguien le añadiera un TTL
// "para aprovechar mejor", el menú o el tema podrían quedarse viejos justo
// después de que la propietaria los cambie. Estos tests fijan que la entrada se
// suelta SIEMPRE al terminar, también cuando la petición falla.
// ─────────────────────────────────────────────────────────────────────────────

function crearDedup() {
  const enVuelo = new Map<string, Promise<unknown>>();
  function unaVez<T>(clave: string, hacer: () => Promise<T>): Promise<T> {
    const yaVa = enVuelo.get(clave);
    if (yaVa) return yaVa as Promise<T>;
    const p = hacer().finally(() => { enVuelo.delete(clave); });
    enVuelo.set(clave, p);
    return p;
  }
  return { unaVez, tamano: () => enVuelo.size };
}

test('dos llamadas simultáneas comparten UNA sola petición', async () => {
  const { unaVez } = crearDedup();
  let veces = 0;
  const lenta = () => { veces++; return new Promise<number>(r => setTimeout(() => r(veces), 20)); };

  const [a, b, c] = await Promise.all([
    unaVez('x', lenta), unaVez('x', lenta), unaVez('x', lenta),
  ]);

  assert.equal(veces, 1, 'tres llamadas a la vez deben hacer una sola petición');
  assert.deepEqual([a, b, c], [1, 1, 1], 'las tres reciben el mismo resultado');
});

test('NO es una caché: una llamada posterior vuelve a pedir', async () => {
  // Esto es lo que la separa de una caché con TTL. Si esto dejara de cumplirse,
  // el panel podría enseñar el menú o el tema anteriores tras guardarlos.
  const { unaVez } = crearDedup();
  let veces = 0;
  const pedir = () => { veces++; return Promise.resolve(veces); };

  assert.equal(await unaVez('x', pedir), 1);
  assert.equal(await unaVez('x', pedir), 2, 'ya resuelta, la siguiente pide de nuevo');
});

test('claves distintas no se pisan', async () => {
  const { unaVez } = crearDedup();
  const [a, b] = await Promise.all([
    unaVez('layout', () => Promise.resolve('L')),
    unaVez('tema', () => Promise.resolve('T')),
  ]);
  assert.deepEqual([a, b], ['L', 'T']);
});

test('si la petición FALLA, la entrada se suelta igual', async () => {
  // Con `then` en vez de `finally`, un fallo puntual dejaría a todo el mundo
  // pegado a una promesa rechazada para siempre.
  const { unaVez, tamano } = crearDedup();
  await assert.rejects(unaVez('x', () => Promise.reject(new Error('boom'))));
  assert.equal(tamano(), 0, 'una petición fallida no puede quedarse atascada');

  // Y el siguiente intento funciona con normalidad.
  assert.equal(await unaVez('x', () => Promise.resolve('ok')), 'ok');
});

test('el fallo llega a TODOS los que esperaban', async () => {
  const { unaVez } = crearDedup();
  const fallar = () => new Promise((_, rej) => setTimeout(() => rej(new Error('boom')), 10));
  const p1 = unaVez('x', fallar);
  const p2 = unaVez('x', fallar);
  await assert.rejects(p1);
  await assert.rejects(p2, 'quien se sumó a la petición compartida también recibe el error');
});
