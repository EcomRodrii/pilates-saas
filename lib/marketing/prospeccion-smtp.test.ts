import test from 'node:test';
import assert from 'node:assert/strict';
import { pieDeBaja, remitenteProspeccion, transporteSpacemail } from './prospeccion-smtp.ts';

// El envío real no se prueba aquí (haría falta un servidor SMTP). Lo que sí se
// prueba es lo que puede romperse en silencio y no lo notaría nadie hasta que
// llegara una reclamación: que el pie legal esté, y que "sin configurar" no
// lance una excepción a mitad de un lote.

test('sin credenciales, transporteSpacemail devuelve null en vez de lanzar', () => {
  const antes = { u: process.env.SPACEMAIL_USER, p: process.env.SPACEMAIL_PASSWORD };
  delete process.env.SPACEMAIL_USER;
  delete process.env.SPACEMAIL_PASSWORD;
  try {
    assert.equal(transporteSpacemail(), null);
  } finally {
    if (antes.u) process.env.SPACEMAIL_USER = antes.u;
    if (antes.p) process.env.SPACEMAIL_PASSWORD = antes.p;
  }
});

test('⚠️ el pie de baja SIEMPRE lleva identidad y una vía de baja (LSSI art. 21)', () => {
  const pie = pieDeBaja();
  assert.match(pie, /Tentare/);
  assert.match(pie, /tentare\.app/);
  // La palabra exacta importa: es la que se le pide a quien responde, y la que
  // habrá que buscar en la bandeja para respetar la baja.
  assert.match(pie, /BAJA/);
});

test('remitenteProspeccion respeta SPACEMAIL_FROM cuando está puesto', () => {
  const antes = process.env.SPACEMAIL_FROM;
  process.env.SPACEMAIL_FROM = 'Marcos · Tentare <marcos@tentare.app>';
  try {
    assert.equal(remitenteProspeccion(), 'Marcos · Tentare <marcos@tentare.app>');
  } finally {
    if (antes === undefined) delete process.env.SPACEMAIL_FROM;
    else process.env.SPACEMAIL_FROM = antes;
  }
});

test('remitenteProspeccion cae al usuario del buzón si no hay SPACEMAIL_FROM', () => {
  const antesFrom = process.env.SPACEMAIL_FROM;
  const antesUser = process.env.SPACEMAIL_USER;
  delete process.env.SPACEMAIL_FROM;
  process.env.SPACEMAIL_USER = 'hola@tentare.app';
  try {
    assert.match(remitenteProspeccion(), /hola@tentare\.app/);
  } finally {
    if (antesFrom !== undefined) process.env.SPACEMAIL_FROM = antesFrom;
    if (antesUser === undefined) delete process.env.SPACEMAIL_USER;
    else process.env.SPACEMAIL_USER = antesUser;
  }
});
