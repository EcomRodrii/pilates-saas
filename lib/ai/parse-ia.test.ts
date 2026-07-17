import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extraerJsonIA, parseJsonIA } from './parse-ia.ts';

test('parsea JSON limpio', () => {
  assert.deepEqual(parseJsonIA('{"a":1}'), { a: 1 });
});

test('parsea JSON envuelto en fences ```json', () => {
  const raw = '```json\n{\n  "slides": [{"tipo":"portada"}]\n}\n```';
  assert.deepEqual(parseJsonIA(raw), { slides: [{ tipo: 'portada' }] });
});

test('parsea JSON con fences ``` sin lenguaje', () => {
  assert.deepEqual(parseJsonIA('```\n{"x":true}\n```'), { x: true });
});

test('parsea JSON con texto de preámbulo/epílogo', () => {
  const raw = 'Aquí tienes el JSON:\n{"nombre":"Campaña"}\n¡Espero que te sirva!';
  assert.deepEqual(parseJsonIA(raw), { nombre: 'Campaña' });
});

test('parsea arrays de nivel superior', () => {
  assert.deepEqual(parseJsonIA('```json\n[1,2,3]\n```'), [1, 2, 3]);
});

test('extraerJsonIA recorta a las llaves exteriores', () => {
  assert.equal(extraerJsonIA('basura {"a":1} más basura'), '{"a":1}');
});

test('lanza con entrada no-JSON', () => {
  assert.throws(() => parseJsonIA('esto no es json'));
});
