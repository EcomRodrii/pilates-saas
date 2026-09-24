import test from 'node:test';
import assert from 'node:assert/strict';
import type { Session } from '@supabase/supabase-js';
import {
  anotarEventoAuth, puedeFijarSinContrasenaActual, suscribirRecuperacion, tomarRecuperacion,
} from './recuperacion-contrasena.ts';

const sesionDe = (id: string) => ({ user: { id } }) as unknown as Session;

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
