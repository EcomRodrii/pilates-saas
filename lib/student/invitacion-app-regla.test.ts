import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  VIGENCIA_INVITACION_MS, invitacionParaCuenta, invitacionVigente, serializarInvitacion, tokenConForma,
} from './invitacion-app-regla.ts';

const TOKEN = 'eyJhbGciOiJIUzI1NiJ9abc.Zm9vYmFyYmF6cXV4';
const AHORA = Date.parse('2026-09-15T16:00:00Z');

test('recién guardada, la invitación vale', () => {
  assert.equal(invitacionVigente(serializarInvitacion(TOKEN, AHORA), AHORA + 60_000), TOKEN);
});

test('caduca a las 24 h: un dispositivo compartido no la guarda para otra persona', () => {
  const raw = serializarInvitacion(TOKEN, AHORA);
  assert.equal(invitacionVigente(raw, AHORA + VIGENCIA_INVITACION_MS - 1), TOKEN);
  assert.equal(invitacionVigente(raw, AHORA + VIGENCIA_INVITACION_MS), null);
});

test('una fecha del futuro o un valor raro no valen', () => {
  assert.equal(invitacionVigente(serializarInvitacion(TOKEN, AHORA + 60_000), AHORA), null);
  assert.equal(invitacionVigente('no es json', AHORA), null);
  assert.equal(invitacionVigente(JSON.stringify({ token: TOKEN }), AHORA), null);
  assert.equal(invitacionVigente(null, AHORA), null);
});

test('solo se guarda algo con forma de token firmado', () => {
  assert.equal(tokenConForma(TOKEN), true);
  assert.equal(tokenConForma('hola'), false);
  assert.equal(tokenConForma('<script>.x'), false);
  assert.equal(tokenConForma(`${'a'.repeat(2000)}.firmafirma`), false);
  assert.equal(invitacionVigente(serializarInvitacion('no-es-token', AHORA), AHORA), null);
});

test('la primera cuenta que entra se queda la invitación', () => {
  const r = invitacionParaCuenta(serializarInvitacion(TOKEN, AHORA), AHORA + 1000, 'cuenta-a');
  assert.equal(r.token, TOKEN);
  assert.equal(r.borrar, false);
  assert.ok(r.guardar, 'se ata a la cuenta');
  // Y conserva la hora original: atarla no le alarga la vida.
  const atada = invitacionParaCuenta(r.guardar, AHORA + 2000, 'cuenta-a');
  assert.deepEqual(atada, { token: TOKEN, guardar: null, borrar: false });
  assert.equal(invitacionVigente(r.guardar, AHORA + VIGENCIA_INVITACION_MS), null);
});

test('otra cuenta en el mismo dispositivo no la ve, y se descarta', () => {
  const atada = serializarInvitacion(TOKEN, AHORA, 'cuenta-a');
  assert.deepEqual(invitacionParaCuenta(atada, AHORA + 1000, 'cuenta-b'), { token: null, guardar: null, borrar: true });
});

test('caducada o ilegible: se descarta', () => {
  assert.deepEqual(
    invitacionParaCuenta(serializarInvitacion(TOKEN, AHORA), AHORA + VIGENCIA_INVITACION_MS, 'cuenta-a'),
    { token: null, guardar: null, borrar: true },
  );
  assert.deepEqual(invitacionParaCuenta(null, AHORA, 'cuenta-a'), { token: null, guardar: null, borrar: false });
});
