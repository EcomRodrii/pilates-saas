import test from 'node:test';
import assert from 'node:assert/strict';

import { disciplinasDe, tituloProfesionalDe } from './catalogo.ts';

test('disciplinasDe: solo pilates', () => {
  assert.deepEqual(disciplinasDe(['reformer', 'mat']), ['pilates']);
});

test('disciplinasDe: solo yoga', () => {
  assert.deepEqual(disciplinasDe(['yoga']), ['yoga']);
});

test('disciplinasDe: pilates y yoga a la vez, sin duplicados', () => {
  assert.deepEqual(disciplinasDe(['reformer', 'yoga', 'mat']), ['pilates', 'yoga']);
});

test('disciplinasDe: hiit/otro no cuentan como disciplina', () => {
  assert.deepEqual(disciplinasDe(['hiit', 'otro']), []);
  assert.deepEqual(disciplinasDe([]), []);
});

test('tituloProfesionalDe: una disciplina', () => {
  assert.equal(tituloProfesionalDe(['reformer']), 'Instructora de Pilates');
  assert.equal(tituloProfesionalDe(['yoga']), 'Instructora de Yoga');
});

test('tituloProfesionalDe: las dos disciplinas', () => {
  assert.equal(tituloProfesionalDe(['reformer', 'yoga']), 'Instructora de Pilates y Yoga');
});

test('tituloProfesionalDe: sin disciplina reconocible, genérico — nunca "Pilates" fabricado', () => {
  assert.equal(tituloProfesionalDe(['hiit']), 'Profesional de Tentare Network');
  assert.equal(tituloProfesionalDe([]), 'Profesional de Tentare Network');
});
