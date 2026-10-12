import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encendidaPara } from './interruptor-por-estudio.ts';

test('apagada de serie; «on» para todos; «estudios:» solo para esos', () => {
  assert.equal(encendidaPara(undefined, 'studio-1'), false);
  assert.equal(encendidaPara('', 'studio-1'), false);
  assert.equal(encendidaPara('true', 'studio-1'), false, 'solo «on» enciende para todos');
  assert.equal(encendidaPara(' on ', 'studio-1'), true);
  assert.equal(encendidaPara('estudios:studio-1, studio-2', 'studio-2'), true);
  assert.equal(encendidaPara('estudios:studio-1', 'studio-3'), false);
  assert.equal(encendidaPara('estudios:studio-1', ''), false);
});
