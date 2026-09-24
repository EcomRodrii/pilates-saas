import test from 'node:test';
import assert from 'node:assert/strict';
import type { Session } from '@supabase/supabase-js';
import {
  anotarEventoAuth, MARGEN_CANJE_S, puedeFijarSinContrasenaActual, sesionRecienNacidaDelCorreo,
  suscribirRecuperacion, tomarRecuperacion,
} from './recuperacion-contrasena.ts';

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
/** Un access token con la forma de los de gotrue (la firma no se mira). */
function token(payload: Record<string, unknown>) {
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.firma`;
}
const AHORA = 1_790_000_000;
/** Lo que trae un enlace de correo recién abierto: verificado y emitido en el mismo instante. */
const tokenDelCorreo = (sub = 'u-1') =>
  token({ sub, iat: AHORA, exp: AHORA + 3600, amr: [{ method: 'otp', timestamp: AHORA }] });

const sesionDe = (id: string, accessToken = tokenDelCorreo(id)) =>
  ({ user: { id }, access_token: accessToken }) as unknown as Session;

// El estado es de módulo (vive lo que la carga de la página): cada caso parte de cero.
test.beforeEach(() => { tomarRecuperacion(); });

test('una sesión ya abierta, sin enlace de por medio, NO basta (FE-02)', () => {
  // `INITIAL_SESSION` es lo que recibe cualquiera con sesión guardada.
  anotarEventoAuth('INITIAL_SESSION', sesionDe('u-1'));
  anotarEventoAuth('SIGNED_IN', sesionDe('u-1'));
  anotarEventoAuth('TOKEN_REFRESHED', sesionDe('u-1'));
  assert.equal(puedeFijarSinContrasenaActual(sesionDe('u-1'), tomarRecuperacion()), false);
});

test('con el enlace canjeado, deja fijarla a esa misma cuenta', () => {
  anotarEventoAuth('PASSWORD_RECOVERY', sesionDe('u-1'));
  assert.equal(puedeFijarSinContrasenaActual(sesionDe('u-1'), tomarRecuperacion()), true);
});

test('lo que llega DESPUÉS del canje no lo borra', () => {
  // Es justo el orden en que la pantalla puede encontrárselo: monta tarde y lo
  // primero que ve es `INITIAL_SESSION`; la anotación tiene que seguir ahí.
  anotarEventoAuth('PASSWORD_RECOVERY', sesionDe('u-1'));
  anotarEventoAuth('INITIAL_SESSION', sesionDe('u-1'));
  anotarEventoAuth('TOKEN_REFRESHED', sesionDe('u-1'));
  anotarEventoAuth('USER_UPDATED', sesionDe('u-1'));
  assert.equal(tomarRecuperacion(), 'u-1');
});

test('el enlace de una cuenta no respalda la sesión de otra', () => {
  anotarEventoAuth('PASSWORD_RECOVERY', sesionDe('u-1'));
  assert.equal(puedeFijarSinContrasenaActual(sesionDe('u-2'), tomarRecuperacion()), false);
});

test('sin sesión no hay nada que fijar, aunque hubiera enlace', () => {
  anotarEventoAuth('PASSWORD_RECOVERY', sesionDe('u-1'));
  assert.equal(puedeFijarSinContrasenaActual(null, tomarRecuperacion()), false);
});

test('cerrar sesión olvida el enlace', () => {
  anotarEventoAuth('PASSWORD_RECOVERY', sesionDe('u-1'));
  anotarEventoAuth('SIGNED_OUT', null);
  assert.equal(tomarRecuperacion(), null);
});

test('un PASSWORD_RECOVERY sin sesión no anota nada', () => {
  anotarEventoAuth('PASSWORD_RECOVERY', null);
  assert.equal(tomarRecuperacion(), null);
});

test('se toma una vez: volver a la pantalla sin recargar ya no la encuentra', () => {
  anotarEventoAuth('PASSWORD_RECOVERY', sesionDe('u-1'));
  assert.equal(tomarRecuperacion(), 'u-1');
  assert.equal(tomarRecuperacion(), null);
});

test('avisa cuando llega una anotación, y deja de avisar al desuscribirse', () => {
  let avisos = 0;
  const soltar = suscribirRecuperacion(() => { avisos++; });
  anotarEventoAuth('PASSWORD_RECOVERY', sesionDe('u-1'));
  anotarEventoAuth('PASSWORD_RECOVERY', sesionDe('u-1')); // mismo valor: sin aviso
  assert.equal(avisos, 1);
  tomarRecuperacion(); // tomarla no es una novedad para nadie
  assert.equal(avisos, 1);
  soltar();
  anotarEventoAuth('PASSWORD_RECOVERY', sesionDe('u-2'));
  assert.equal(avisos, 1);
});

test('un PASSWORD_RECOVERY cuyo token no nació de verificar el correo no anota nada', () => {
  // El evento solo no basta: la sesión tiene que haber nacido de abrir el correo.
  const conContrasena = token({ sub: 'u-1', iat: AHORA, amr: [{ method: 'password', timestamp: AHORA }] });
  anotarEventoAuth('PASSWORD_RECOVERY', sesionDe('u-1', conContrasena));
  assert.equal(tomarRecuperacion(), null);
});

test('sesionRecienNacidaDelCorreo: el enlace recién abierto, sí', () => {
  assert.equal(sesionRecienNacidaDelCorreo(tokenDelCorreo()), true);
  // Flujo PKCE, por si algún día se cambia.
  assert.equal(sesionRecienNacidaDelCorreo(
    token({ iat: AHORA, amr: [{ method: 'recovery', timestamp: AHORA }] })), true);
  // Varios métodos en la misma sesión: basta con que uno sea el correo.
  assert.equal(sesionRecienNacidaDelCorreo(
    token({ iat: AHORA, amr: [{ method: 'password', timestamp: AHORA - 99 }, { method: 'otp', timestamp: AHORA }] })), true);
});

test('sesionRecienNacidaDelCorreo: otros métodos, no', () => {
  for (const method of ['password', 'oauth', 'token_refresh', 'anonymous', 'totp', 'magiclink']) {
    assert.equal(sesionRecienNacidaDelCorreo(token({ iat: AHORA, amr: [{ method, timestamp: AHORA }] })), false, method);
  }
});

test('sesionRecienNacidaDelCorreo: una verificación del correo de hace tiempo, no', () => {
  // Una sesión que empezó con un enlace de correo hace días sigue llevando
  // `otp` en su amr tras cada refresco; eso no es haber abierto el correo ahora.
  const vieja = token({ iat: AHORA, amr: [{ method: 'otp', timestamp: AHORA - MARGEN_CANJE_S - 1 }] });
  assert.equal(sesionRecienNacidaDelCorreo(vieja), false);
  const justo = token({ iat: AHORA, amr: [{ method: 'otp', timestamp: AHORA - MARGEN_CANJE_S }] });
  assert.equal(sesionRecienNacidaDelCorreo(justo), true);
});

test('sesionRecienNacidaDelCorreo: falla cerrado con cualquier cosa rara', () => {
  const raros: unknown[] = [
    undefined, null, 42, '', 'e2e-fake-token', 'a.b', 'a.b.c.d', 'x.%%%.y',
    token({ amr: [{ method: 'otp', timestamp: AHORA }] }), // sin iat
    token({ iat: AHORA }), // sin amr
    token({ iat: AHORA, amr: 'otp' }),
    token({ iat: AHORA, amr: [{ method: 'otp' }] }), // sin fecha
    token({ iat: AHORA, amr: [{ method: 'otp', timestamp: '1790000000' }] }),
    token({ iat: AHORA, amr: [{ method: 'otp', timestamp: AHORA + 3600 }] }), // del futuro
    token({ iat: 'ayer', amr: [{ method: 'otp', timestamp: AHORA }] }),
  ];
  for (const t of raros) assert.equal(sesionRecienNacidaDelCorreo(t), false, String(t).slice(0, 40));
});
