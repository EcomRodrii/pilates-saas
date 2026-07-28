import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esDominioReservado } from './dominios-reservados.ts';

test('detecta los dominios de ejemplo que Resend rechaza', () => {
  // Los que había de verdad en producción, fallando 16 veces al día.
  assert.ok(esDominioReservado('ana@ejemplo.com'));
  assert.ok(esDominioReservado('lucia@ejemplo.com'));
  assert.ok(esDominioReservado('alguien@example.com'));
  assert.ok(esDominioReservado('alguien@example.org'));
  assert.ok(esDominioReservado('alguien@example.net'));
  assert.ok(esDominioReservado('root@localhost'));
  assert.ok(esDominioReservado('a@invalid'));
});

test('cubre el dominio al que migramos los datos de demo', () => {
  // `.test` es un TLD reservado por la RFC 2606: no existe y no se resolverá
  // nunca. Es el destino de los correos de supabase/seed.sql y de los CSV de
  // ejemplo de lib/migracion/ejemplos.ts. Si alguien lo sacara de la lista, los
  // envíos de prueba volverían a salir de verdad — por eso se fija aquí.
  assert.ok(esDominioReservado('maria.soler@ejemplo.test'));
  assert.ok(esDominioReservado('hola@pilatesboutique.test'));
});

test('acepta subdominios de un dominio reservado', () => {
  assert.ok(esDominioReservado('ana@mail.example.com'));
  assert.ok(esDominioReservado('ana@correo.ejemplo.com'));
});

test('no bloquea direcciones reales', () => {
  assert.equal(esDominioReservado('carmen@studiocarmen.es'), false);
  assert.equal(esDominioReservado('ana@gmail.com'), false);
  assert.equal(esDominioReservado('marta@tentare.app'), false);
  // 'test' es reservado como TLD, pero no como parte del nombre.
  assert.equal(esDominioReservado('ana@testing.es'), false);
  assert.equal(esDominioReservado('ana@protest.com'), false);
});

test('es indiferente a mayúsculas y espacios', () => {
  assert.ok(esDominioReservado('Ana@EJEMPLO.COM'));
  assert.ok(esDominioReservado('ana@ Ejemplo.com '));
});

test('no revienta con entradas vacías o mal formadas', () => {
  assert.equal(esDominioReservado(null), false);
  assert.equal(esDominioReservado(undefined), false);
  assert.equal(esDominioReservado(''), false);
  assert.equal(esDominioReservado('sin-arroba'), false);
  assert.equal(esDominioReservado('ana@'), false);
});
