import { test } from 'node:test';
import assert from 'node:assert/strict';
import { debeAvisarSubidaPrecio } from './aviso-subida-precio.ts';

test('sin cobro previo (alta reciente, primer ciclo) no avisa: no hay "subida" que valga', () => {
  assert.equal(debeAvisarSubidaPrecio(null, 30), false);
});

test('el precio nuevo más alto que el anterior avisa', () => {
  assert.equal(debeAvisarSubidaPrecio(25, 30), true);
});

test('el precio nuevo igual al anterior no avisa', () => {
  assert.equal(debeAvisarSubidaPrecio(30, 30), false);
});

test('una bajada de precio no avisa: no es la situación que PAY-6 cubre', () => {
  assert.equal(debeAvisarSubidaPrecio(30, 25), false);
});
