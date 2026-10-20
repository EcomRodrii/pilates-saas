import test from 'node:test';
import assert from 'node:assert/strict';
import { COSTE_MAX_PREGUNTA_USD, MAX_CONTEXTO_TOKENS, MAX_HERRAMIENTAS, MAX_LLAMADAS } from './limites.ts';
import { MAX_TOKENS_RESPUESTA } from './modelo.ts';

// Propuestas A, D y E de tenti-propuesta-limites, aprobadas por el fundador. B (herramientas y llamadas)
// y C (filas y caracteres) siguen como estaban: suben la latencia o necesitan comprobar la UI primero.
test('tope de salida 800, contexto 52.000 y tope de coste por pregunta 0,05 $', () => {
  assert.equal(MAX_TOKENS_RESPUESTA, 800);
  assert.equal(MAX_CONTEXTO_TOKENS, 52_000);
  assert.equal(COSTE_MAX_PREGUNTA_USD, 0.05);
});

test('el tope de coste por pregunta son 2 unidades como máximo (ceil(coste / 0,03))', () => {
  assert.equal(Math.ceil(COSTE_MAX_PREGUNTA_USD / 0.03), 2);
});

test('herramientas y llamadas por pregunta no cambian (propuesta B, pendiente de probar en NuevoTentare)', () => {
  assert.equal(MAX_HERRAMIENTAS, 5);
  assert.equal(MAX_LLAMADAS, 6);
});
