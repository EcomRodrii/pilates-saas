import { test } from 'node:test';
import assert from 'node:assert/strict';
import { asistenteEncendidoPara, estudiosDelInterruptor } from './interruptor.ts';

test('on: encendido para todos, siempre que haya clave', () => {
  assert.equal(asistenteEncendidoPara('on', true, 'studio-a'), true);
  assert.equal(asistenteEncendidoPara(' on ', true, 'studio-a'), true);
  assert.equal(asistenteEncendidoPara('on', false, 'studio-a'), false);
});

test('apagado por defecto: sin variable, off o cualquier otra cosa', () => {
  for (const v of [undefined, '', 'off', 'ON', 'true', '1', 'estudio:studio-a']) {
    assert.equal(asistenteEncendidoPara(v, true, 'studio-a'), false, String(v));
  }
});

test('estudios:<ids>: solo en esos estudios, ids exactos', () => {
  const v = 'estudios: studio-a , studio-b,,';
  assert.deepEqual(estudiosDelInterruptor(v), ['studio-a', 'studio-b']);
  assert.equal(asistenteEncendidoPara(v, true, 'studio-a'), true);
  assert.equal(asistenteEncendidoPara(v, true, 'studio-b'), true);
  assert.equal(asistenteEncendidoPara(v, true, 'studio-c'), false);
  // Ni un prefijo ni un trozo: el id entero.
  assert.equal(asistenteEncendidoPara(v, true, 'studio'), false);
  assert.equal(asistenteEncendidoPara(v, true, ''), false);
  assert.equal(asistenteEncendidoPara(v, false, 'studio-a'), false);
  assert.equal(asistenteEncendidoPara('estudios:', true, 'studio-a'), false);
});
