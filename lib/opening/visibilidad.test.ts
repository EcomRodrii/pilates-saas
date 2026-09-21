import { test } from 'node:test';
import assert from 'node:assert/strict';
import { debeMostrarApertura, diasHastaApertura } from './visibilidad.ts';

const NOW = new Date('2026-10-01T10:00:00Z');

test('estudio que ya opera (fase OPERANDO) no la ve nunca', () => {
  assert.equal(debeMostrarApertura({ fechaApertura: '2026-10-20', fase: 'OPERANDO', estudioCreadoEn: '2026-09-25T00:00:00Z', tieneAsistencias: false }, NOW), false);
});

test('con fecha: visible antes de abrir y hasta 30 días después', () => {
  assert.equal(debeMostrarApertura({ fechaApertura: '2026-10-20', fase: null, estudioCreadoEn: null, tieneAsistencias: false }, NOW), true);
  assert.equal(debeMostrarApertura({ fechaApertura: '2026-09-02', fase: null, estudioCreadoEn: null, tieneAsistencias: false }, NOW), true);
  assert.equal(debeMostrarApertura({ fechaApertura: '2026-09-01', fase: null, estudioCreadoEn: null, tieneAsistencias: false }, NOW), false);
});

test('sin fecha: solo se pregunta a estudios dados de alta hace menos de 30 días', () => {
  assert.equal(debeMostrarApertura({ fechaApertura: null, fase: null, estudioCreadoEn: '2026-09-20T00:00:00Z', tieneAsistencias: false }, NOW), true);
  assert.equal(debeMostrarApertura({ fechaApertura: null, fase: null, estudioCreadoEn: '2025-01-01T00:00:00Z', tieneAsistencias: false }, NOW), false);
  assert.equal(debeMostrarApertura({ fechaApertura: null, fase: null, estudioCreadoEn: null, tieneAsistencias: false }, NOW), false);
});

test('estudio migrado: alta reciente pero ya da clases → no se le pregunta cuándo abre', () => {
  assert.equal(debeMostrarApertura({ fechaApertura: null, fase: null, estudioCreadoEn: '2026-09-20T00:00:00Z', tieneAsistencias: true }, NOW), false);
});

test('si la propietaria puso fecha, se ve aunque ya haya asistencias (clases de prueba)', () => {
  assert.equal(debeMostrarApertura({ fechaApertura: '2026-10-20', fase: null, estudioCreadoEn: null, tieneAsistencias: true }, NOW), true);
});

test('días hasta apertura en días naturales, sin depender de la hora', () => {
  assert.equal(diasHastaApertura('2026-10-01', NOW), 0);
  assert.equal(diasHastaApertura('2026-10-08', NOW), 7);
  assert.equal(diasHastaApertura('2026-09-28', NOW), -3);
  assert.equal(diasHastaApertura(null, NOW), null);
});
