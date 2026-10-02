import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { caducaAntesDe, nombreDeMarca } from './tarjeta-caducidad.ts';
import * as conStripe from './caducidad-tarjeta.ts';

test('sin Stripe: el panel la importa en el navegador y no puede arrastrar el SDK', () => {
  const fuente = readFileSync(join(import.meta.dirname, 'tarjeta-caducidad.ts'), 'utf8');
  assert.doesNotMatch(fuente, /^\s*import\b/m, 'tarjeta-caducidad.ts no importa nada');
});

test('el módulo con Stripe reexporta las mismas funciones (una sola regla)', () => {
  assert.equal(conStripe.caducaAntesDe, caducaAntesDe);
  assert.equal(conStripe.nombreDeMarca, nombreDeMarca);
});

test('una tarjeta 09/2026 vale todo septiembre y deja de valer el 1 de octubre', () => {
  const t = { expMes: 9, expAnio: 2026 };
  assert.equal(caducaAntesDe(t, new Date('2026-09-30T23:59:59Z')), false);
  assert.equal(caducaAntesDe(t, new Date('2026-10-01T00:00:00Z')), true);
  assert.equal(caducaAntesDe({ expMes: 12, expAnio: 2026 }, new Date('2027-01-01T00:00:00Z')), true, 'diciembre pasa de año');
  assert.equal(caducaAntesDe({ expMes: null, expAnio: 2026 }, new Date('2030-01-01T00:00:00Z')), false, 'sin dato no se afirma nada');
});

test('la marca se escribe para la pantalla', () => {
  assert.equal(nombreDeMarca('visa'), 'Visa');
  assert.equal(nombreDeMarca('mastercard'), 'Mastercard');
  assert.equal(nombreDeMarca(null), 'Tarjeta');
});
