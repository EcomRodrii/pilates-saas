import test from 'node:test';
import assert from 'node:assert/strict';
import { debeInvitar, OCULTAR_INVITACION_DIAS } from './push-invitacion.ts';

const AHORA = Date.UTC(2026, 8, 27);
const DIA = 86_400_000;

test('se ofrece donde puede hacer algo: activar o instalar', () => {
  for (const e of ['default', 'granted-off', 'ios-sin-instalar'] as const) assert.equal(debeInvitar(e, null, AHORA, true), true, e);
});

test('no se ofrece si ya está activo, bloqueado, sin soporte o sin servidor configurado', () => {
  for (const e of ['granted-on', 'denied', 'unsupported', 'sin-clave'] as const) assert.equal(debeInvitar(e, null, AHORA, true), false, e);
});

test('sin sesión o sin estado leído, nada', () => {
  assert.equal(debeInvitar('default', null, AHORA, false), false);
  assert.equal(debeInvitar(null, null, AHORA, true), false);
});

test('«ahora no» la oculta 14 días y luego vuelve', () => {
  assert.equal(debeInvitar('default', AHORA - 3 * DIA, AHORA, true), false);
  assert.equal(debeInvitar('default', AHORA - OCULTAR_INVITACION_DIAS * DIA, AHORA, true), true);
});

test('un reloj que fue hacia atrás no la oculta para siempre', () => {
  assert.equal(debeInvitar('default', AHORA + 5 * DIA, AHORA, true), true);
});
