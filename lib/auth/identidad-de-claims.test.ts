import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identidadDeClaims } from './identidad-de-claims.ts';

test('una persona: id y email salen de las claims', () => {
  assert.deepEqual(
    identidadDeClaims({ sub: 'u1', email: 'a@example.com', role: 'authenticated' }),
    { id: 'u1', email: 'a@example.com' },
  );
});

test('sin email en el token, el email es null (no un string vacío ni undefined)', () => {
  assert.deepEqual(identidadDeClaims({ sub: 'u1', role: 'authenticated' }), { id: 'u1', email: null });
  assert.deepEqual(identidadDeClaims({ sub: 'u1', email: 42, role: 'authenticated' }), { id: 'u1', email: null });
});

test('la clave anónima y la de service-role no son una persona', () => {
  assert.equal(identidadDeClaims({ role: 'anon' }), null);
  assert.equal(identidadDeClaims({ role: 'service_role' }), null);
  // Aunque trajeran sub: el rol manda.
  assert.equal(identidadDeClaims({ sub: 'u1', role: 'service_role' }), null);
});

test('sin sub, o con sub vacío o no textual, no hay identidad', () => {
  assert.equal(identidadDeClaims({ role: 'authenticated' }), null);
  assert.equal(identidadDeClaims({ sub: '', role: 'authenticated' }), null);
  assert.equal(identidadDeClaims({ sub: 7, role: 'authenticated' }), null);
  assert.equal(identidadDeClaims(null), null);
  assert.equal(identidadDeClaims(undefined), null);
});
