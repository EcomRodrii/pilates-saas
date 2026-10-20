import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MAX_TOKENS_RESPUESTA, MODELO_ASISTENTE, MODELO_RESPALDO, PRECIOS_POR_MODELO, parametrosDelModelo, preciosDe,
} from './modelo.ts';

test('el modelo es Haiku 5.5, en UNA constante, y el respaldo es Haiku 4.5 (otro modelo distinto)', () => {
  assert.equal(MODELO_ASISTENTE, 'claude-haiku-5-5');
  assert.equal(MODELO_RESPALDO, 'claude-haiku-4-5');
  assert.notEqual(MODELO_ASISTENTE, MODELO_RESPALDO);
  // Cada modelo que puede responder tiene sus precios: el libro nunca se queda sin poder calcular el coste.
  for (const m of [MODELO_ASISTENTE, MODELO_RESPALDO]) assert.ok(PRECIOS_POR_MODELO[m], `sin precios para ${m}`);
});

test('precios de Haiku 5.5 y de Haiku 4.5 (platform.claude.com/docs/en/about-claude/pricing, 20-oct-2026)', () => {
  assert.deepEqual(preciosDe('claude-haiku-5-5'), { entrada: 0.1, salida: 0.5, escrituraCache: 0.125, escrituraCache1h: 0.2, lecturaCache: 0.01 });
  assert.deepEqual(preciosDe('claude-haiku-5-5', 100_001), { entrada: 0.5, salida: 2.5, escrituraCache: 0.625, escrituraCache1h: 1, lecturaCache: 0.05 });
  assert.deepEqual(preciosDe('claude-haiku-4-5'), { entrada: 1, salida: 5, escrituraCache: 1.25, escrituraCache1h: 2, lecturaCache: 0.1 });
});

test('Haiku 5.5: sin temperatura (solo acepta 1) y con thinking apagado a propósito; Haiku 4.5, con su temperatura', () => {
  const p55 = parametrosDelModelo('claude-haiku-5-5');
  assert.deepEqual(p55, { thinking: { type: 'disabled' } });
  assert.equal('temperature' in p55, false);
  assert.deepEqual(parametrosDelModelo('claude-haiku-4-5'), { temperature: 0.2 });
});

test('nada en el asistente manda top_p, top_k ni una temperatura fija (Haiku 5.5 las rechaza con un 400)', () => {
  for (const f of ['bucle.ts', 'modelo.ts']) {
    const src = readFileSync(new URL(`./${f}`, import.meta.url), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(src, /top_p|top_k/, f);
  }
  const bucle = readFileSync(new URL('./bucle.ts', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(bucle, /temperature\s*:/, 'la temperatura sale de parametrosDelModelo, solo para el modelo que la acepta');
});

test('el tope de salida sigue en 600: subirlo cambia el coste máximo por consulta y es una decisión aparte', () => {
  assert.equal(MAX_TOKENS_RESPUESTA, 600);
});
