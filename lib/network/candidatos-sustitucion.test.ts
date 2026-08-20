import { test } from 'node:test';
import assert from 'node:assert/strict';
import { franjasDe } from './candidatos-sustitucion.ts';

// 2026-08-18 es martes, 2026-08-15 es sábado (en Europe/Madrid) — mismos
// días que ya usa el resto de la suite para franjas locales.

test('martes por la mañana → solo mananas', () => {
  assert.deepEqual(franjasDe('2026-08-18T09:00:00+02:00'), ['mananas']);
});

test('martes por la tarde → solo tardes', () => {
  assert.deepEqual(franjasDe('2026-08-18T16:00:00+02:00'), ['tardes']);
});

test('martes por la noche → solo noches', () => {
  assert.deepEqual(franjasDe('2026-08-18T21:00:00+02:00'), ['noches']);
});

test('sábado por la mañana → mananas Y fines_semana, no una sola', () => {
  assert.deepEqual(franjasDe('2026-08-15T09:00:00+02:00'), ['mananas', 'fines_semana']);
});

test('sábado por la noche → noches Y fines_semana', () => {
  assert.deepEqual(franjasDe('2026-08-15T22:00:00+02:00'), ['noches', 'fines_semana']);
});

test('límite de franja: las 14:00 en punto ya cuentan como tardes, no mananas', () => {
  assert.deepEqual(franjasDe('2026-08-18T14:00:00+02:00'), ['tardes']);
});
