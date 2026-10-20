import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { costeUsd, sumarUso, unidadesACobrar, unidadesDe, USO_CERO } from './coste.ts';
import { MAX_CHARLAS_GRATIS_DIA } from './limites.ts';
import { MODELO_ASISTENTE, PRECIOS_HAIKU_45, PRECIOS_HAIKU_55, PRECIOS_HAIKU_55_LARGO, preciosDe } from './modelo.ts';

const H45 = 'claude-haiku-4-5';

test('costeUsd con el modelo de las consultas ya cerradas (Haiku 4.5): entrada, caché leída, caché escrita y salida', () => {
  assert.equal(costeUsd({ input: 1_000_000, output: 0, cacheRead: 0, cacheCreation: 0 }, H45), 1);
  assert.equal(costeUsd({ input: 0, output: 1_000_000, cacheRead: 0, cacheCreation: 0 }, H45), 5);
  assert.equal(costeUsd({ input: 0, output: 0, cacheRead: 1_000_000, cacheCreation: 0 }, H45), 0.1);
  assert.equal(costeUsd({ input: 0, output: 0, cacheRead: 0, cacheCreation: 1_000_000 }, H45), 1.25);
  // Una pregunta típica: 5K de prefijo leído de caché, 3K de datos y 400 de salida.
  assert.equal(costeUsd({ input: 3000, output: 400, cacheRead: 5000, cacheCreation: 0 }, H45), 0.0055);
});

test('costeUsd con Haiku 5.5 (precios de platform.claude.com, 20-oct-2026), y es el modelo por defecto del asistente', () => {
  assert.equal(MODELO_ASISTENTE, 'claude-haiku-5-5');
  // Con prompts de 100.000 tokens o menos (la tarifa corriente).
  assert.equal(costeUsd({ input: 100_000, output: 0, cacheRead: 0, cacheCreation: 0 }), 0.01);
  assert.equal(costeUsd({ input: 0, output: 1_000_000, cacheRead: 0, cacheCreation: 0 }), 0.5);
  assert.equal(costeUsd({ input: 0, output: 0, cacheRead: 100_000, cacheCreation: 0 }), 0.001);
  assert.equal(costeUsd({ input: 0, output: 0, cacheRead: 0, cacheCreation: 100_000 }), 0.0125);
  assert.equal(costeUsd({ input: 0, output: 0, cacheRead: 0, cacheCreation: 100_000, cacheCreation1h: 100_000 }), 0.02);
  // La misma pregunta típica que arriba: 5K leídos de caché, 3K de datos y 400 de salida.
  assert.equal(costeUsd({ input: 3000, output: 400, cacheRead: 5000, cacheCreation: 0 }), 0.00055);
});

test('Haiku 5.5: un prompt de más de 100.000 tokens (entrada + caché leída + escrita) paga la tarifa larga entera', () => {
  assert.equal(costeUsd({ input: 100_000, output: 1_000_000, cacheRead: 0, cacheCreation: 0 }), 0.01 + 0.5, 'en el umbral exacto, tarifa corriente');
  assert.equal(costeUsd({ input: 100_001, output: 1_000_000, cacheRead: 0, cacheCreation: 0 }), 0.050001 + 2.5);
  // La caché cuenta para el tamaño del prompt: 90.000 leídos + 20.000 escritos = 110.000 → larga.
  assert.equal(costeUsd({ input: 0, output: 0, cacheRead: 90_000, cacheCreation: 20_000 }), 0.0045 + 0.0125);
});

test('preciosDe: un modelo sin tabla lanza (un coste inventado en el libro es peor que un error) y el histórico conserva los precios de Haiku 4.5', () => {
  assert.throws(() => preciosDe('claude-otro'), /Sin precios/);
  assert.deepEqual(preciosDe('claude-haiku-4-5'), PRECIOS_HAIKU_45);
  // Haiku 4.5 no tiene tarifa larga: 1 M tokens de prompt de 200 K paga lo mismo por token.
  assert.equal(preciosDe('claude-haiku-4-5', 500_000).entrada, 1);
  assert.deepEqual(preciosDe('claude-haiku-5-5', 100_000), PRECIOS_HAIKU_55);
  assert.deepEqual(preciosDe('claude-haiku-5-5', 100_001), PRECIOS_HAIKU_55_LARGO);
});

test('sumarUso acumula también los campos de caché (que pueden venir a null)', () => {
  const u = sumarUso(sumarUso(USO_CERO, { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100, cache_creation_input_tokens: null }), { input_tokens: 1, output_tokens: 1 });
  assert.deepEqual(u, { input: 11, output: 6, cacheRead: 100, cacheCreation: 0 });
});

test('lo escrito con TTL de una hora cuesta 2× (el prefijo); lo de 5 minutos, 1,25×', () => {
  const u = sumarUso(USO_CERO, {
    input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 1_000_000,
    cache_creation: { ephemeral_1h_input_tokens: 600_000 },
  });
  assert.deepEqual(u, { input: 0, output: 0, cacheRead: 0, cacheCreation: 1_000_000, cacheCreation1h: 600_000 });
  assert.equal(costeUsd(u, H45), 0.4 * 1.25 + 0.6 * 2);
  // Y con Haiku 5.5: 0,4 M a 0,125 $ y 0,6 M a 0,20 $ (el prompt es de 1 M de tokens: tarifa larga, 5×).
  assert.equal(costeUsd(u), 0.4 * 0.625 + 0.6 * 1);
  // Y se acumula entre llamadas.
  assert.equal(sumarUso(u, { input_tokens: 0, output_tokens: 0, cache_creation: { ephemeral_1h_input_tokens: 1 } }).cacheCreation1h, 600_001);
});

test('unidadesDe: el espejo de la fórmula de ia_cerrar_consulta (1 por cada 0,03 $ empezados, de 1 a 5)', () => {
  assert.equal(unidadesDe(0.004), 1);
  assert.equal(unidadesDe(0.03), 1);
  assert.equal(unidadesDe(0.031), 2);
  assert.equal(unidadesDe(0.5), 5);
});

test('la charla (sin herramientas) no gasta hasta el tope del día; con datos, siempre', () => {
  const base = { estado: 'CONSUMIDA' as const, costeUsd: 0.002 };
  assert.equal(unidadesACobrar({ ...base, nHerramientas: 0, charlasGratisHoy: 0 }), 0);
  assert.equal(unidadesACobrar({ ...base, nHerramientas: 0, charlasGratisHoy: MAX_CHARLAS_GRATIS_DIA - 1 }), 0, 'la 50.ª sigue gratis');
  assert.equal(unidadesACobrar({ ...base, nHerramientas: 0, charlasGratisHoy: MAX_CHARLAS_GRATIS_DIA }), 1, 'pasado el tope, gasta');
  assert.equal(unidadesACobrar({ ...base, nHerramientas: 1, charlasGratisHoy: 0 }), 1, 'con una herramienta, gasta');
  assert.equal(unidadesACobrar({ estado: 'CONSUMIDA', costeUsd: 0.09, nHerramientas: 3, charlasGratisHoy: 0 }), 3);
  assert.equal(unidadesACobrar({ estado: 'FALLIDA', costeUsd: 0.09, nHerramientas: 3, charlasGratisHoy: 99 }), 0);
  assert.equal(unidadesACobrar({ estado: 'LIBERADA', costeUsd: 0, nHerramientas: 0, charlasGratisHoy: 99 }), 0);
});

test('el tope de charla de TS es el de ia_cerrar_consulta, y la regla mira las herramientas dentro del libro', () => {
  const dir = new URL('../../supabase/migrations/', import.meta.url);
  const fichero = readdirSync(dir).filter(n => n.endsWith('_asistente_charla_no_gasta.sql'));
  assert.equal(fichero.length, 1, 'una sola migración de la charla');
  const sql = readFileSync(new URL(fichero[0], dir), 'utf8');
  assert.match(sql, new RegExp(`v_max_charlas constant integer := ${MAX_CHARLAS_GRATIS_DIA};`));
  assert.match(sql, /coalesce\(p_n_herramientas, 0\) = 0/);
  // El tope se cuenta con el día de Madrid y dentro del bloqueo del estudio (antes del reparto de unidades).
  assert.match(sql, /date_trunc\('day', now\(\) at time zone 'Europe\/Madrid'\)/);
  assert.ok(sql.indexOf('for no key update') < sql.indexOf('v_charlas < v_max_charlas'));
  for (const rol of ['public', 'anon', 'authenticated']) {
    assert.match(sql, new RegExp(`revoke all on function public\\.ia_cerrar_consulta\\([^)]*\\) from ${rol};`));
  }
});
