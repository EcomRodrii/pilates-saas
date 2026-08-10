import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapLimit } from './concurrency.ts';

// ─────────────────────────────────────────────────────────────────────────────
// `mapLimit` es lo que impide que el arranque del panel lance las ~53 consultas
// de golpe (ver CONSULTAS_A_LA_VEZ en supabase-data.ts). Estos tests fijan las
// dos propiedades de las que depende ese uso:
//
//   1. NUNCA hay más de `limit` tareas vivas a la vez — es todo el punto.
//   2. El resultado sale en el ORDEN DE ENTRADA, porque quien lo llama
//      desestructura 53 posiciones y una permutación las cruzaría en silencio.
//
// El tercero prueba la premisa que hace viable el cambio: las consultas de
// supabase-js son PEREZOSAS (el fetch vive en `then()`), así que meterlas en un
// array no las dispara — solo las dispara `mapLimit` al llegar a ellas.
// ─────────────────────────────────────────────────────────────────────────────

test('nunca hay más de `limit` tareas a la vez', async () => {
  let vivas = 0, pico = 0;
  await mapLimit(Array.from({ length: 53 }, (_, i) => i), 8, async () => {
    vivas++;
    pico = Math.max(pico, vivas);
    await new Promise(r => setTimeout(r, 1));
    vivas--;
  });
  assert.ok(pico <= 8, `el pico fue ${pico}, debería ser <= 8`);
  assert.ok(pico > 1, 'con 53 tareas y límite 8 debería haber solapamiento real');
});

test('devuelve los resultados en el orden de entrada', async () => {
  // Las tareas terminan en orden INVERSO al de entrada a propósito: si el
  // resultado siguiera el orden de finalización, el desestructurado posicional
  // de fetchCriticalStudioData cruzaría tablas sin dar ningún error.
  const items = [40, 30, 20, 10, 0];
  const out = await mapLimit(items, 8, async (ms, i) => {
    await new Promise(r => setTimeout(r, ms));
    return i;
  });
  assert.deepEqual(out, [0, 1, 2, 3, 4]);
});

test('un thenable perezoso no se dispara hasta que mapLimit llega a él', async () => {
  // Réplica del contrato de PostgrestBuilder: el trabajo vive dentro de then().
  // Es lo que permite construir la lista entera de consultas y resolverla por
  // tandas sin tocar ninguna.
  const disparados: number[] = [];
  const perezoso = (i: number) => ({
    then(res: (v: number) => void) { disparados.push(i); res(i); },
  });

  const consultas = [0, 1, 2, 3, 4, 5].map(perezoso);
  assert.deepEqual(disparados, [], 'construir la lista no puede disparar nada');

  const out = await mapLimit(consultas, 2, (q) => Promise.resolve(q));
  assert.deepEqual(out, [0, 1, 2, 3, 4, 5]);
  assert.equal(disparados.length, 6, 'al final se disparan todas, pero de dos en dos');
});
