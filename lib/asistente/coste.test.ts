import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { costeUsd, sumarUso, unidadesACobrar, unidadesDe, USO_CERO } from './coste.ts';
import { MAX_CHARLAS_GRATIS_DIA } from './limites.ts';

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

test('lo escrito con TTL de una hora cuesta 2× (el prefijo); lo de 5 minutos, 1,25×', () => {
  const u = sumarUso(USO_CERO, {
    input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 1_000_000,
    cache_creation: { ephemeral_1h_input_tokens: 600_000 },
  });
  assert.deepEqual(u, { input: 0, output: 0, cacheRead: 0, cacheCreation: 1_000_000, cacheCreation1h: 600_000 });
  assert.equal(costeUsd(u), 0.4 * 1.25 + 0.6 * 2);
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
