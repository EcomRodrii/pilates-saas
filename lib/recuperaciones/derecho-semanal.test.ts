import { test } from 'node:test';
import assert from 'node:assert/strict';
import { derechoDeRecuperaciones } from './derecho-semanal.ts';

// El caso que da nombre a la funcionalidad: 2 por semana, cancela una a tiempo
// y ya no le cabe otra → recupera una.
test('canceló a tiempo y no llegó a recuperar el hueco → 1', () => {
  assert.equal(derechoDeRecuperaciones(2, 1, 1), 1);
});

// ⚠️ El caso que impide regalar clases: canceló, PERO volvió a reservar y
// llenó su semana. No perdió nada.
test('canceló pero volvió a llenar la semana → 0', () => {
  assert.equal(derechoDeRecuperaciones(2, 2, 1), 0);
});

test('sin cancelar nada no se otorga nada, por muchos huecos libres que deje', () => {
  assert.equal(derechoDeRecuperaciones(3, 0, 0), 0);
});

// Dejó 2 huecos pero solo canceló 1: el otro lo dejó libre ella.
test('nunca más recuperaciones que cancelaciones', () => {
  assert.equal(derechoDeRecuperaciones(3, 1, 1), 1);
});

// Y al revés: canceló 3 veces pero solo le quedaba 1 hueco por llenar.
test('nunca más recuperaciones que huecos sin usar', () => {
  assert.equal(derechoDeRecuperaciones(2, 1, 3), 1);
});

test('sin límite semanal no hay nada que recuperar', () => {
  assert.equal(derechoDeRecuperaciones(0, 0, 5), 0);
});

// Puede pasar: reservó de más con una recuperación previa y encima canceló.
test('usadas por encima del límite no da negativo', () => {
  assert.equal(derechoDeRecuperaciones(2, 3, 1), 0);
});

// ── semanaCerrada ─────────────────────────────────────────────────────────────
// El barrido corre el lunes y reparte por la semana que ACABA de cerrarse, no
// por la que empieza. Equivocarse aquí reparte por una semana a medias.
import { semanaCerrada } from './otorgar-semanales-fechas.ts';

test('un lunes reparte por la semana anterior completa', () => {
  // 2026-09-07 es lunes.
  assert.deepEqual(semanaCerrada(new Date('2026-09-07T06:00:00Z')),
    { desde: '2026-08-31', hasta: '2026-09-06' });
});

test('da igual el día en que corra: siempre la semana anterior', () => {
  // Miércoles 9 → sigue siendo la semana del 31 al 6.
  assert.deepEqual(semanaCerrada(new Date('2026-09-09T23:00:00Z')),
    { desde: '2026-08-31', hasta: '2026-09-06' });
});

test('un domingo sigue mirando la semana anterior, no la que está acabando', () => {
  // 2026-09-06 es domingo: la semana en curso es la del 31, así que cierra la del 24.
  assert.deepEqual(semanaCerrada(new Date('2026-09-06T22:00:00Z')),
    { desde: '2026-08-24', hasta: '2026-08-30' });
});

test('la ventana es de 7 días, lunes a domingo', () => {
  const { desde, hasta } = semanaCerrada(new Date('2026-01-05T10:00:00Z'));
  const dias = (Date.parse(hasta) - Date.parse(desde)) / 86_400_000;
  assert.equal(dias, 6);
  assert.equal(new Date(desde + 'T00:00:00Z').getUTCDay(), 1, 'desde debe ser lunes');
  assert.equal(new Date(hasta + 'T00:00:00Z').getUTCDay(), 0, 'hasta debe ser domingo');
});
