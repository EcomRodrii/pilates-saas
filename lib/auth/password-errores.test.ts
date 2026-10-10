import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mensajeDePassword, textoPasswordCorta,
  TEXTO_PASSWORD_FILTRADA, TEXTO_PASSWORD_IGUAL, TEXTO_PASSWORD_CARACTERES,
} from './password-errores.ts';

// El mensaje literal que gotrue devolvió en producción el 9-oct-2026 (422 en
// /signup) y que la pantalla del alta enseñaba como «al menos 6 caracteres».
const LITERAL_DEL_9_OCT = 'Password is known to be weak and easy to guess, please choose a different one.';

test('contraseña filtrada o demasiado común: lo dice, NO dice que sea corta (el fallo del 9-oct)', () => {
  const t = mensajeDePassword({ message: LITERAL_DEL_9_OCT });
  assert.equal(t, TEXTO_PASSWORD_FILTRADA);
  assert.doesNotMatch(t!, /corta|caracteres/i, 'una contraseña larga no puede salir con «demasiado corta»');
});

test('con `reasons` de gotrue manda el motivo, aunque el texto diga otra cosa', () => {
  assert.equal(mensajeDePassword({ message: 'Weak password', code: 'weak_password', reasons: ['pwned'] }), TEXTO_PASSWORD_FILTRADA);
  assert.equal(mensajeDePassword({ message: 'x', reasons: ['length'] }), textoPasswordCorta(8));
  assert.equal(mensajeDePassword({ message: 'x', reasons: ['characters'] }), TEXTO_PASSWORD_CARACTERES);
});

test('demasiado corta: cita el mínimo que dice el servidor, o el del proyecto (8), nunca 6', () => {
  assert.equal(mensajeDePassword({ message: 'Password should be at least 8 characters.' }), 'La contraseña es demasiado corta. Usa al menos 8 caracteres.');
  assert.equal(mensajeDePassword({ message: 'Password should be at least 12 characters' }), 'La contraseña es demasiado corta. Usa al menos 12 caracteres.');
  assert.equal(mensajeDePassword({ message: 'x', reasons: ['length'] }), 'La contraseña es demasiado corta. Usa al menos 8 caracteres.');
  assert.doesNotMatch(textoPasswordCorta(8), /\b6\b/);
});

test('requisitos de caracteres', () => {
  assert.equal(
    mensajeDePassword({ message: 'Password should contain at least one character of each: abcdefghijklmnopqrstuvwxyz, 0123456789.' }),
    TEXTO_PASSWORD_CARACTERES,
  );
});

test('cambiar por la misma es otro motivo', () => {
  assert.equal(mensajeDePassword({ message: 'New password should be different from the old password.' }), TEXTO_PASSWORD_IGUAL);
  assert.equal(mensajeDePassword({ message: 'x', code: 'same_password' }), TEXTO_PASSWORD_IGUAL);
});

test('weak_password sin motivo conocido no se disfraza de «corta»', () => {
  assert.equal(mensajeDePassword({ message: 'x', code: 'weak_password' }), TEXTO_PASSWORD_FILTRADA);
});

test('lo que NO es de contraseña devuelve null: no se inventa un motivo', () => {
  assert.equal(mensajeDePassword({ message: 'Invalid login credentials' }), null);
  assert.equal(mensajeDePassword({ message: 'User already registered' }), null);
  assert.equal(mensajeDePassword({ message: 'captcha protection: request disallowed (no captcha_token found)' }), null);
  assert.equal(mensajeDePassword({ message: 'Database error saving new user' }), null);
  assert.equal(mensajeDePassword({}), null);
});

test('una contraseña con la palabra «password» en otro error no se toma por fallo de longitud', () => {
  assert.equal(mensajeDePassword({ message: 'Unable to process password recovery request' }), null);
});
