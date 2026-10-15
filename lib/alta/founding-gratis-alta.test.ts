import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foundingGratisEnAltas } from './founding-gratis-alta.ts';

test('el alta empieza gratis solo con el interruptor encendido para todos', () => {
  assert.equal(foundingGratisEnAltas('on'), true);
  assert.equal(foundingGratisEnAltas(' on '), true);
  // Encendido para unos estudios: los nuevos siguen con la prueba.
  assert.equal(foundingGratisEnAltas('estudios:st-1,st-2'), false);
  assert.equal(foundingGratisEnAltas(undefined), false);
  assert.equal(foundingGratisEnAltas(''), false);
  assert.equal(foundingGratisEnAltas('off'), false);
});
