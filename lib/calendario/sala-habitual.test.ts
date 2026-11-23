import test from 'node:test';
import assert from 'node:assert/strict';
import { salaHabitualDelTipo } from './sala-habitual.ts';

const salas = [{ id: 'suelo' }, { id: 'reformer' }];

test('sin historial propone la primera sala', () => {
  assert.equal(salaHabitualDelTipo([], 'yoga', salas), 'suelo');
});

test('propone la sala donde más se da ese tipo', () => {
  const ex = [
    { salaId: 'reformer', tipoClaseId: 'reformer-t' },
    { salaId: 'reformer', tipoClaseId: 'reformer-t' },
    { salaId: 'suelo', tipoClaseId: 'reformer-t' },
    { salaId: 'suelo', tipoClaseId: 'otro' },
  ];
  assert.equal(salaHabitualDelTipo(ex, 'reformer-t', salas), 'reformer');
});

test('ignora salas que ya no existen y sin salas devuelve vacío', () => {
  assert.equal(salaHabitualDelTipo([{ salaId: 'borrada', tipoClaseId: 'x' }], 'x', salas), 'suelo');
  assert.equal(salaHabitualDelTipo([], 'x', []), '');
});
