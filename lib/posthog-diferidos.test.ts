import { test } from 'node:test';
import assert from 'node:assert/strict';

import { aparcarEvento, recogerEventos, CLAVE_EVENTOS_DIFERIDOS } from './posthog-diferidos.ts';
import { debeCargarseAnalitica } from './posthog-privacidad.ts';

function almacenFalso() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
    m,
  };
}

// El motivo de todo esto: en /login no se carga PostHog, y no se debe cargar.
test('/login sigue excluida de la analítica (el evento se aparca, no se abre la puerta)', () => {
  assert.equal(debeCargarseAnalitica('/login', false), false);
  assert.equal(debeCargarseAnalitica('/dashboard', false), true);
});

test('un evento aparcado en /login sale una sola vez al recogerlo en el panel', () => {
  const a = almacenFalso();
  aparcarEvento(a, 'alta_estudio_creada');
  assert.deepEqual(recogerEventos(a), ['alta_estudio_creada']);
  assert.deepEqual(recogerEventos(a), [], 'recogerlo lo borra: no se cuenta dos veces');
  assert.equal(a.m.has(CLAVE_EVENTOS_DIFERIDOS), false);
});

test('dos pasadas por /login no son dos altas', () => {
  const a = almacenFalso();
  aparcarEvento(a, 'alta_estudio_creada');
  aparcarEvento(a, 'alta_estudio_creada');
  assert.deepEqual(recogerEventos(a), ['alta_estudio_creada']);
});

test('solo se aparcan eventos de la lista cerrada, y solo sale lo que está en ella', () => {
  const a = almacenFalso();
  aparcarEvento(a, 'cualquier_cosa');
  assert.equal(a.m.has(CLAVE_EVENTOS_DIFERIDOS), false);
  // Algo escrito a mano en sessionStorage no se cuela en PostHog.
  a.setItem(CLAVE_EVENTOS_DIFERIDOS, JSON.stringify(['alta_estudio_creada', 'inventado', { email: 'x@example.com' }]));
  assert.deepEqual(recogerEventos(a), ['alta_estudio_creada']);
});

test('un sessionStorage roto o inservible no rompe el acceso', () => {
  const a = almacenFalso();
  a.setItem(CLAVE_EVENTOS_DIFERIDOS, '{no es json');
  assert.deepEqual(recogerEventos(a), []);
  const lleno = { ...almacenFalso(), setItem: () => { throw new Error('QuotaExceededError'); } };
  assert.doesNotThrow(() => aparcarEvento(lleno, 'alta_estudio_creada'));
});
