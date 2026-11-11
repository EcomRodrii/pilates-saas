import test from 'node:test';
import assert from 'node:assert/strict';
import { sinPushApagadoPorElEstudio } from './inapp.ts';

const canales = ['PUSH', 'EMAIL'] as const;

test('un aviso apagado por el estudio pierde el PUSH para sus clientes y conserva el resto', () => {
  assert.deepEqual(sinPushApagadoPorElEstudio([...canales], ['valoracion.pedir'], 'valoracion.pedir', 'SOCIA', false), ['EMAIL']);
});

test('lo que el estudio no apagó no se toca, ni con la lista vacía o ilegible', () => {
  assert.deepEqual(sinPushApagadoPorElEstudio([...canales], ['otro.evento'], 'valoracion.pedir', 'SOCIA', false), [...canales]);
  assert.deepEqual(sinPushApagadoPorElEstudio([...canales], [], 'valoracion.pedir', 'SOCIA', false), [...canales]);
  assert.deepEqual(sinPushApagadoPorElEstudio([...canales], null, 'valoracion.pedir', 'SOCIA', false), [...canales]);
});

test('un aviso crítico no se apaga nunca, y el apagado solo afecta a los clientes', () => {
  assert.deepEqual(sinPushApagadoPorElEstudio([...canales], ['x'], 'x', 'SOCIA', true), [...canales]);
  assert.deepEqual(sinPushApagadoPorElEstudio([...canales], ['x'], 'x', 'INSTRUCTOR', false), [...canales]);
  assert.deepEqual(sinPushApagadoPorElEstudio([...canales], ['x'], 'x', 'PROPIETARIA', false), [...canales]);
});
