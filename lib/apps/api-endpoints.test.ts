import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { BASE_API, ORDEN_GRUPOS, endpointsDeLaApi } from './api-endpoints.ts';

function rutasDeApp(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...rutasDeApp(p, base));
    else if (e === 'route.ts') out.push('/' + relative(base, dir).split('\\').join('/').replace(/\[(\w+)\]/g, '{$1}'));
  }
  return out;
}

test('cada ruta de app/api/v1 está en la página, y al revés', () => {
  const real = rutasDeApp(new URL('../../app/api/v1', import.meta.url).pathname).filter(r => r !== '/openapi.json');
  const enseñadas = [...new Set(endpointsDeLaApi().map(e => e.ruta))];
  assert.deepEqual(enseñadas.sort(), real.sort());
});

test('cada endpoint dice su método, su ruta y qué permiso pide', () => {
  const todos = endpointsDeLaApi();
  assert.ok(todos.length >= 10);
  for (const e of todos) {
    assert.ok(e.ruta.startsWith('/'), e.ruta);
    assert.ok(e.resumen.length > 3, e.ruta);
  }
  const clientas = todos.filter(e => e.ruta === '/clientas').map(e => `${e.metodo}:${e.scope}`);
  assert.deepEqual(clientas, ['GET:clientas:leer', 'POST:clientas:escribir']);
});

test('la dirección base es la de producción y con https', () => {
  assert.equal(BASE_API, 'https://www.tentare.app/api/v1');
});

test('el dinero nunca se escribe desde fuera', () => {
  for (const e of endpointsDeLaApi().filter(x => x.metodo === 'POST')) assert.ok(!/pagos|facturas/.test(e.scope ?? ''), e.ruta);
});

test('toda ruta pertenece a un grupo conocido (una nueva sin grupo falla aquí)', () => {
  for (const e of endpointsDeLaApi()) assert.ok((ORDEN_GRUPOS as readonly string[]).includes(e.grupo), `${e.ruta}: grupo ${e.grupo}`);
});
