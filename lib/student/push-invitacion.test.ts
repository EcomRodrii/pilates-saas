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

import { debeOfrecerTrasReserva, OFERTAS_TRAS_RESERVA_MAX } from './push-invitacion.ts';

test('tras reservar solo se ofrece donde el botón funciona, sin insistir ni a quien los apagó', () => {
  assert.equal(debeOfrecerTrasReserva('default', 0, false), true);
  assert.equal(debeOfrecerTrasReserva('granted-off', 1, false), true);
  assert.equal(debeOfrecerTrasReserva('granted-off', 0, true), false, 'los apagó ella');
  assert.equal(debeOfrecerTrasReserva('default', 0, true), true, 'nunca decidió: la marca solo vale con permiso concedido');
  assert.equal(debeOfrecerTrasReserva('default', OFERTAS_TRAS_RESERVA_MAX, false), false, 'ya salió dos veces');
  for (const e of ['granted-on', 'denied', 'ios-sin-instalar', 'sin-clave', 'unsupported', null] as const) {
    assert.equal(debeOfrecerTrasReserva(e, 0, false), false, String(e));
  }
});
