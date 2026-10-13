import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claveColumnas, guardarColumnas, leerColumnas } from './columnas.ts';

const almacen = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, m };
};

test('se guarda por persona y estudio, y se lee en el orden del catálogo', () => {
  const a = almacen();
  const clave = claveColumnas('u1', 's1');
  guardarColumnas(a, clave, ['email', 'frecuencia']);
  assert.deepEqual(leerColumnas(a, clave), ['frecuencia', 'email']);
  assert.deepEqual(leerColumnas(a, claveColumnas('u2', 's1')), [], 'otra persona, lo de serie');
  assert.deepEqual(leerColumnas(a, claveColumnas('u1', 's2')), [], 'otro estudio, lo de serie');
});

test('un dato roto, ids desconocidos o sin almacenamiento: lo de serie, sin romper', () => {
  const a = almacen();
  a.m.set('k', '{no es json');
  assert.deepEqual(leerColumnas(a, 'k'), []);
  a.m.set('k', JSON.stringify(['salud', 'gastado', 'telefono']));
  assert.deepEqual(leerColumnas(a, 'k'), ['telefono']);
  assert.deepEqual(leerColumnas(null, 'k'), []);
  const roto = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('lleno'); } };
  assert.deepEqual(leerColumnas(roto, 'k'), []);
  assert.doesNotThrow(() => guardarColumnas(roto, 'k', ['email']));
});

test('no hay columnas de salud ni de dinero en el catálogo', async () => {
  const { COLUMNAS_EXTRA } = await import('./columnas.ts');
  for (const c of COLUMNAS_EXTRA) assert.doesNotMatch(`${c.id} ${c.titulo}`, /salud|lesi|patolog|gastad|deuda|importe|€/i);
});
