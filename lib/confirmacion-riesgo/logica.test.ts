import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  horasHasta, enVentanaDeAviso, pasoElCorte,
  VENTANA_ASK_HORAS_MIN, VENTANA_ASK_HORAS_MAX, CUTOFF_HORAS_ANTES,
} from './logica.ts';

const AHORA = new Date('2026-07-21T12:00:00.000Z');
const horasDespues = (h: number) => new Date(AHORA.getTime() + h * 60 * 60 * 1000).toISOString();

test('horasHasta: una clase futura da horas positivas', () => {
  assert.ok(Math.abs(horasHasta(horasDespues(24), AHORA) - 24) < 1e-9);
});

test('horasHasta: una clase pasada da horas negativas', () => {
  assert.ok(horasHasta(horasDespues(-2), AHORA) < 0);
});

// ── Ventana de aviso ─────────────────────────────────────────────────────────

test('enVentanaDeAviso: dentro de la banda 20-30h → true', () => {
  assert.equal(enVentanaDeAviso(25), true);
});

test('enVentanaDeAviso: límites inclusive', () => {
  assert.equal(enVentanaDeAviso(VENTANA_ASK_HORAS_MIN), true);
  assert.equal(enVentanaDeAviso(VENTANA_ASK_HORAS_MAX), true);
});

test('enVentanaDeAviso: fuera de la banda (muy pronto o muy lejos) → false', () => {
  assert.equal(enVentanaDeAviso(10), false);
  assert.equal(enVentanaDeAviso(40), false);
});

// ── Corte ────────────────────────────────────────────────────────────────────

test('pasoElCorte: dentro de las 3h antes de clase → true', () => {
  assert.equal(pasoElCorte(1), true);
  assert.equal(pasoElCorte(CUTOFF_HORAS_ANTES), true);
});

test('pasoElCorte: todavía faltan más de 3h → false (aún no toca)', () => {
  assert.equal(pasoElCorte(5), false);
});

test('pasoElCorte: la clase YA EMPEZÓ (horas <= 0) → false, no se libera retroactivamente', () => {
  assert.equal(pasoElCorte(0), false);
  assert.equal(pasoElCorte(-1), false);
});
