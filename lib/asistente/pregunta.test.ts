import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pareceUnaPregunta } from './pregunta.ts';

test('parece una pregunta: ¿…, interrogativo, acaba en ?, o 4 palabras o más', () => {
  for (const q of ['¿cuántas alumnas tengo', 'cuantas alumnas activas', 'Qué clases hay mañana', 'clases flojas?', 'por qué baja la ocupación', 'resumen del estudio hoy', 'quién no viene']) {
    assert.equal(pareceUnaPregunta(q), true, q);
  }
});

test('no parece una pregunta: una búsqueda corta de navegación', () => {
  for (const q of ['', '  ', 'Ana', 'cobros', 'calendario semana', 'por favor']) assert.equal(pareceUnaPregunta(q), false, q);
});
