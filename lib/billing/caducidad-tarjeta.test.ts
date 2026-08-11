import { test } from 'node:test';
import assert from 'node:assert/strict';
import { caducidadDe, caducaAntesDe } from './caducidad-tarjeta.ts';

// Forma mínima de un PaymentMethod de Stripe: solo lo que se lee.
const pmTarjeta = (card: Record<string, unknown>) => ({ card } as never);

test('caducidadDe: extrae mes, año, marca y últimos 4', () => {
  const c = caducidadDe(pmTarjeta({ exp_month: 9, exp_year: 2026, brand: 'visa', last4: '4242' }));
  assert.deepEqual(c, { expMes: 9, expAnio: 2026, marca: 'visa', ultimos4: '4242' });
});

test('caducidadDe: lo que no es tarjeta (SEPA, Bizum) → null', () => {
  assert.equal(caducidadDe(undefined), null);
  assert.equal(caducidadDe(null), null);
  assert.equal(caducidadDe({ sepa_debit: {} } as never), null);
});

test('caducidadDe: sin los campos de caducidad → null, no un objeto a medias', () => {
  assert.equal(caducidadDe(pmTarjeta({ brand: 'visa', last4: '4242' })), null);
  assert.equal(caducidadDe(pmTarjeta({ exp_month: 9, brand: 'visa' })), null);
});

test('caducidadDe: un mes imposible se descarta entero', () => {
  assert.equal(caducidadDe(pmTarjeta({ exp_month: 13, exp_year: 2026 })), null);
  assert.equal(caducidadDe(pmTarjeta({ exp_month: 0, exp_year: 2026 })), null);
});

test('caducidadDe: unos "últimos 4" que no son 4 dígitos se guardan como null, no revientan el CHECK', () => {
  const c = caducidadDe(pmTarjeta({ exp_month: 9, exp_year: 2026, last4: '42' }));
  assert.ok(c);
  assert.equal(c.ultimos4, null);
  assert.equal(c.expMes, 9);
});

// ── El error clásico: una tarjeta 09/2026 vale TODO septiembre ──────────────

test('caducaAntesDe: la tarjeta sirve hasta el ÚLTIMO día de su mes', () => {
  const t = { expMes: 9, expAnio: 2026 };
  // Todo septiembre sigue valiendo, incluido el último día.
  assert.equal(caducaAntesDe(t, new Date('2026-09-01T00:00:00Z')), false);
  assert.equal(caducaAntesDe(t, new Date('2026-09-30T23:59:59Z')), false);
  // El 1 de octubre ya no.
  assert.equal(caducaAntesDe(t, new Date('2026-10-01T00:00:00Z')), true);
});

test('caducaAntesDe: cruza el año sin equivocarse', () => {
  const t = { expMes: 12, expAnio: 2026 };
  assert.equal(caducaAntesDe(t, new Date('2026-12-31T12:00:00Z')), false);
  assert.equal(caducaAntesDe(t, new Date('2027-01-01T00:00:00Z')), true);
});

test('caducaAntesDe: sin dato no se afirma nada (null NO es "caduca")', () => {
  assert.equal(caducaAntesDe({ expMes: null, expAnio: null }, new Date('2030-01-01T00:00:00Z')), false);
  assert.equal(caducaAntesDe({ expMes: 9, expAnio: null }, new Date('2030-01-01T00:00:00Z')), false);
});
