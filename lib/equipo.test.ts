import { test } from 'node:test';
import assert from 'node:assert/strict';
import { imparteClases, queImparten } from './equipo.ts';

// `instructores` es la tabla del STAFF completo. Recepción es una fila más y
// salía como instructora asignable — incluso en el portal público de socias.

test('recepción no imparte clases', () => {
  assert.equal(imparteClases({ rol: 'RECEPCION' }), false);
});

test('instructora y propietaria sí (en un estudio pequeño la dueña da clases)', () => {
  assert.equal(imparteClases({ rol: 'INSTRUCTOR' }), true);
  assert.equal(imparteClases({ rol: 'PROPIETARIO' }), true);
});

test('sin rol se asume INSTRUCTOR, que es el default de la BD', () => {
  assert.equal(imparteClases({}), true);
  assert.equal(imparteClases({ rol: null }), true);
});

test('queImparten quita recepción y a quien está de baja', () => {
  const equipo = [
    { id: 'i1', nombre: 'Marta', rol: 'INSTRUCTOR', activo: true },
    { id: 'i2', nombre: 'Sara (recepción)', rol: 'RECEPCION', activo: true },
    { id: 'i3', nombre: 'Laura de baja', rol: 'INSTRUCTOR', activo: false },
    { id: 'i4', nombre: 'Cloe (dueña)', rol: 'PROPIETARIO', activo: true },
  ];
  assert.deepEqual(queImparten(equipo).map(i => i.id), ['i1', 'i4']);
});

test('sin `activo` se cuenta como en plantilla (lo trata la BD por defecto)', () => {
  assert.deepEqual(queImparten([{ id: 'i1', rol: 'INSTRUCTOR' }]).map(i => i.id), ['i1']);
});

test('no muta la lista original', () => {
  const equipo = [{ id: 'i1', rol: 'RECEPCION', activo: true }];
  queImparten(equipo);
  assert.equal(equipo.length, 1);
});
