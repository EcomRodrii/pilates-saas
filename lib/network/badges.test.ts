import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emailVerificado, experienciaVerificada, referenciaProfesional, identidadVerificada, activaRecientemente,
} from './badges.ts';

test('emailVerificado: null/undefined es falso, cualquier fecha es verdadero', () => {
  assert.equal(emailVerificado(null), false);
  assert.equal(emailVerificado(undefined), false);
  assert.equal(emailVerificado('2026-01-01T00:00:00Z'), true);
});

test('experienciaVerificada: exige al menos una CONFIRMADA, no solo pendiente', () => {
  assert.equal(experienciaVerificada([]), false);
  assert.equal(experienciaVerificada(['pendiente', 'rechazada']), false);
  assert.equal(experienciaVerificada(['pendiente', 'confirmada']), true);
});

test('referenciaProfesional: cuenta > 0', () => {
  assert.equal(referenciaProfesional(0), false);
  assert.equal(referenciaProfesional(1), true);
});

test('identidadVerificada: null sin verificar, cualquier fecha verificado', () => {
  assert.equal(identidadVerificada(null), false);
  assert.equal(identidadVerificada('2026-01-01T00:00:00Z'), true);
});

test('activaRecientemente: dentro de 30 días es verdadero, más allá no', () => {
  const ahora = new Date('2026-08-13T12:00:00Z');
  assert.equal(activaRecientemente('2026-08-01T00:00:00Z', ahora), true);
  assert.equal(activaRecientemente('2026-06-01T00:00:00Z', ahora), false);
  assert.equal(activaRecientemente(null, ahora), false);
});

test('activaRecientemente: una fecha futura (reloj desincronizado) no rompe, da false', () => {
  const ahora = new Date('2026-08-13T12:00:00Z');
  assert.equal(activaRecientemente('2026-09-01T00:00:00Z', ahora), false);
});
