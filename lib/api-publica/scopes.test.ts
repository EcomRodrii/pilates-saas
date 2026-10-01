import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scopesQuePuedeConceder, scopesEfectivos, scopesDelPlan } from './scopes.ts';
import { SCOPES_VALIDOS } from './catalogo-scopes.ts';

test('la propietaria puede dar todo el catálogo', () => {
  assert.deepEqual(scopesQuePuedeConceder('PROPIETARIO'), [...SCOPES_VALIDOS]);
});

test('un MANAGER no puede dar dinero ni datos fiscales: no los ve en el panel', () => {
  const m = scopesQuePuedeConceder('MANAGER');
  for (const s of ['pagos:leer', 'facturas:leer', 'clientas:datos_fiscales'] as const) {
    assert.ok(!m.includes(s), `MANAGER no puede conceder ${s}`);
  }
  assert.ok(m.includes('clientas:leer') && m.includes('reservas:escribir'));
});

test('quien no gestiona apps no concede nada', () => {
  assert.deepEqual(scopesQuePuedeConceder('RECEPCION'), []);
  assert.deepEqual(scopesQuePuedeConceder('INSTRUCTOR'), []);
  assert.deepEqual(scopesQuePuedeConceder(null), []);
});

test('lo que vale en una petición se recorta al rol que tiene HOY quien la concedió', () => {
  const credencial = ['clientas:leer', 'pagos:leer', 'facturas:leer'];
  assert.deepEqual(scopesEfectivos({ credencial, rolDeQuienConcedio: 'PROPIETARIO', plan: 'BASE' }), ['clientas:leer', 'pagos:leer', 'facturas:leer']);
  // La propietaria que autorizó ya no lo es (p. ej. pasó a MANAGER): el dinero se cae.
  assert.deepEqual(scopesEfectivos({ credencial, rolDeQuienConcedio: 'MANAGER', plan: 'BASE' }), ['clientas:leer']);
  // Ya no está en el estudio: nada.
  assert.deepEqual(scopesEfectivos({ credencial, rolDeQuienConcedio: null, plan: 'BASE' }), []);
});

test('scopes desconocidos en una credencial no se cuelan', () => {
  assert.deepEqual(scopesEfectivos({ credencial: ['pagos:escribir', 'clientas:leer'], rolDeQuienConcedio: 'PROPIETARIO', plan: 'CADENA' }), ['clientas:leer']);
});

test('hoy ningún plan recorta scopes (sin límites comerciales inventados)', () => {
  for (const plan of ['BASE', 'ESTUDIO', 'CADENA'] as const) assert.deepEqual([...scopesDelPlan(plan)], [...SCOPES_VALIDOS]);
});
