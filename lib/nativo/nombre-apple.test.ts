import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nombreDeApple, nombreGuardado } from './nombre-apple.ts';

test('nombreDeApple junta pila y apellidos', () => {
  assert.equal(nombreDeApple({ pila: 'Marcos', apellidos: 'Roca Rodríguez' }), 'Marcos Roca Rodríguez');
});

test('nombreDeApple acepta solo la pila o solo los apellidos', () => {
  assert.equal(nombreDeApple({ pila: 'Marcos', apellidos: null }), 'Marcos');
  assert.equal(nombreDeApple({ pila: null, apellidos: 'Roca' }), 'Roca');
});

test('nombreDeApple devuelve null si Apple no trae nombre (segunda autorización)', () => {
  assert.equal(nombreDeApple(undefined), null);
  assert.equal(nombreDeApple({ pila: null, apellidos: null }), null);
  assert.equal(nombreDeApple({ pila: '   ', apellidos: '' }), null);
});

test('nombreDeApple limpia espacios sobrantes', () => {
  assert.equal(nombreDeApple({ pila: '  Marcos ', apellidos: ' Roca ' }), 'Marcos Roca');
});

test('nombreGuardado solo acepta un texto con contenido', () => {
  assert.equal(nombreGuardado(' Marcos Roca '), 'Marcos Roca');
  assert.equal(nombreGuardado('   '), null);
  assert.equal(nombreGuardado(undefined), null);
  assert.equal(nombreGuardado(42), null);
});
