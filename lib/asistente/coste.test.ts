import { test } from 'node:test';
import assert from 'node:assert/strict';
import { costeUsd, sumarUso, unidadesDe, USO_CERO } from './coste.ts';

test('costeUsd: entrada, caché leída, caché escrita y salida a precios de Haiku 4.5', () => {
  assert.equal(costeUsd({ input: 1_000_000, output: 0, cacheRead: 0, cacheCreation: 0 }), 1);
  assert.equal(costeUsd({ input: 0, output: 1_000_000, cacheRead: 0, cacheCreation: 0 }), 5);
  assert.equal(costeUsd({ input: 0, output: 0, cacheRead: 1_000_000, cacheCreation: 0 }), 0.1);
  assert.equal(costeUsd({ input: 0, output: 0, cacheRead: 0, cacheCreation: 1_000_000 }), 1.25);
  // Una pregunta típica: 5K de prefijo leído de caché, 3K de datos y 400 de salida.
  assert.equal(costeUsd({ input: 3000, output: 400, cacheRead: 5000, cacheCreation: 0 }), 0.0055);
});

test('sumarUso acumula también los campos de caché (que pueden venir a null)', () => {
  const u = sumarUso(sumarUso(USO_CERO, { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100, cache_creation_input_tokens: null }), { input_tokens: 1, output_tokens: 1 });
  assert.deepEqual(u, { input: 11, output: 6, cacheRead: 100, cacheCreation: 0 });
});

test('unidadesDe: el espejo de la fórmula de ia_cerrar_consulta (1 por cada 0,03 $ empezados, de 1 a 5)', () => {
  assert.equal(unidadesDe(0.004), 1);
  assert.equal(unidadesDe(0.03), 1);
  assert.equal(unidadesDe(0.031), 2);
  assert.equal(unidadesDe(0.5), 5);
});
