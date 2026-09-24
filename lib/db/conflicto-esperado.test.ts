import test from 'node:test';
import assert from 'node:assert/strict';
import { esConflictoDeNegocioEsperado } from './conflicto-esperado.ts';

test('un 409 de nuestras rutas es un «no» de negocio', () => {
  assert.equal(esConflictoDeNegocioEsperado({ error: 'dejarías el estudio sin propietaria', status: 409 }), true);
});

test('el solape de horario de Postgres (23P01) también', () => {
  // Lo que devuelve supabase-js al insertar una clase que solapa.
  assert.equal(esConflictoDeNegocioEsperado({
    code: '23P01', details: 'Key conflicts with existing key.', hint: null,
    message: 'conflicting key value violates exclusion constraint "sesiones_instructor_sin_solape"',
  }), true);
});

test('el resto de fallos de BD SIGUEN llegando a Sentry', () => {
  for (const codigo of ['23505', '23503', '23514', '42501', '42P01', 'PGRST116', '40001', '57014']) {
    assert.equal(esConflictoDeNegocioEsperado({ code: codigo, message: 'x' }), false, codigo);
  }
  // Ni un 500, ni un 403, ni un 401: solo el 409 es «un no correcto».
  for (const status of [400, 401, 403, 404, 500, 503]) {
    assert.equal(esConflictoDeNegocioEsperado({ status }), false, String(status));
  }
});

test('lo que no es un objeto de error, no', () => {
  for (const raro of [null, undefined, 409, '23P01', true, new Error('x')]) {
    assert.equal(esConflictoDeNegocioEsperado(raro), false, String(raro));
  }
});
