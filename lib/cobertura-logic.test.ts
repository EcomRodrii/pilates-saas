import { test } from 'node:test';
import assert from 'node:assert/strict';
import { candidatosCobertura } from './cobertura-logic.ts';

const instructores = [
  { id: 'orig', nombre: 'Original', telefono: '600111111', activo: true },
  { id: 'a', nombre: 'Ana', telefono: '600222222', activo: true },
  { id: 'b', nombre: 'Berta', telefono: null, activo: true },
  { id: 'c', nombre: 'Carla (inactiva)', telefono: '600444444', activo: false },
];

test('ordena por veces impartida descendente, excluye a la instructora original', () => {
  const sesiones = [
    { instructorId: 'orig', tipoClaseId: 'mat', cancelada: false },
    { instructorId: 'a', tipoClaseId: 'mat', cancelada: false },
    { instructorId: 'a', tipoClaseId: 'mat', cancelada: false },
    { instructorId: 'b', tipoClaseId: 'mat', cancelada: false },
  ];
  const r = candidatosCobertura({ instructorId: 'orig', tipoClaseId: 'mat' }, sesiones, instructores);
  assert.equal(r.length, 2); // excluye 'orig' y a la inactiva 'c'
  assert.equal(r[0].instructorId, 'a');
  assert.equal(r[0].vecesImpartida, 2);
  assert.equal(r[1].instructorId, 'b');
  assert.equal(r[1].vecesImpartida, 1);
});

test('incluye instructoras sin historial de esa clase con conteo 0', () => {
  const r = candidatosCobertura({ instructorId: 'orig', tipoClaseId: 'reformer' }, [], instructores);
  assert.equal(r.length, 2);
  assert.ok(r.every(c => c.vecesImpartida === 0));
});

test('ignora sesiones canceladas y de otro tipo de clase al contar', () => {
  const sesiones = [
    { instructorId: 'a', tipoClaseId: 'mat', cancelada: true },
    { instructorId: 'a', tipoClaseId: 'reformer', cancelada: false },
  ];
  const r = candidatosCobertura({ instructorId: 'orig', tipoClaseId: 'mat' }, sesiones, instructores);
  const ana = r.find(c => c.instructorId === 'a')!;
  assert.equal(ana.vecesImpartida, 0);
});

test('excluye instructoras inactivas de la lista de candidatas', () => {
  const r = candidatosCobertura({ instructorId: 'orig', tipoClaseId: 'mat' }, [], instructores);
  assert.ok(!r.some(c => c.instructorId === 'c'));
});
