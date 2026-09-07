import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codigoDeError, traducirAuth } from './auth-errores.ts';

test('el email sin confirmar se detecta por TEXTO y por código', () => {
  // gotrue manda `email_not_confirmed` en las versiones nuevas y «Email not
  // confirmed» en las viejas. Atarse a uno dejaría el caso sin detectar en
  // cuanto cambiara la versión — y ese caso es el que crea cuentas duplicadas.
  assert.equal(codigoDeError('Email not confirmed'), 'sin-confirmar');
  assert.equal(codigoDeError('email_not_confirmed'), 'sin-confirmar');
  assert.equal(codigoDeError('Invalid login credentials'), undefined);
  assert.equal(codigoDeError(''), undefined);
});

test('los errores de gotrue NO salen en crudo', () => {
  // El encargo lo pide expresamente: nada de «AuthApiError: Invalid login
  // credentials» en pantalla.
  assert.equal(traducirAuth('Invalid login credentials'), 'Email o contraseña incorrectos.');
  assert.match(traducirAuth('Email rate limit exceeded')!, /Demasiados intentos/);
  assert.match(traducirAuth('User already registered')!, /Ya existe una cuenta/);
  assert.match(traducirAuth('Password should be at least 8 characters')!, /demasiado corta/);
});

test('lo que no se reconoce devuelve null, para que decida quien llama', () => {
  // Y no un texto por defecto: quien llama aplica `mensajeSeguro`, que deja
  // pasar los mensajes legibles de gotrue y solo sustituye los técnicos.
  // Devolver el respaldo aquí perdería los que gotrue sí redacta bien.
  assert.equal(traducirAuth('unexpected_failure: something went sideways'), null);
});

test('«sin confirmar» tiene mensaje propio y ACCIONABLE, no un callejón', () => {
  // El texto viejo terminaba en «Mira tu correo», sin salida. La pantalla
  // ofrece el enlace mágico cuando el código es este.
  const t = traducirAuth('Email not confirmed')!;
  assert.match(t, /confirmar tu email/i);
  assert.doesNotMatch(t, /mira tu correo/i);
});
