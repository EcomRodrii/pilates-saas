import test from 'node:test';
import assert from 'node:assert/strict';
import { spotsActivosDeLaSala } from './huecos-sala.ts';

test('los sitios de UNA sala, y solo los activos (sin `activo` cuentan, como siempre)', () => {
  const spots = [
    { id: 'a', salaId: 's1' }, { id: 'b', salaId: 's1', activo: false }, { id: 'c', salaId: 's1', activo: true }, { id: 'd', salaId: 's2' },
  ];
  assert.deepEqual(spotsActivosDeLaSala(spots, 's1').map((s) => s.id), ['a', 'c']);
  assert.deepEqual(spotsActivosDeLaSala(spots, 's3'), []);
  assert.deepEqual(spotsActivosDeLaSala(null, 's1'), []);
});
