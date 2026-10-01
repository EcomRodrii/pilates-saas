import { test } from 'node:test';
import assert from 'node:assert/strict';
import { usoDelTope } from './uso-tope.ts';
import { entitlementsDe } from './entitlements.ts';

test('cuántas de las que permite su plan, contra el tope de ese plan', () => {
  assert.deepEqual(usoDelTope(128, entitlementsDe({ plan: 'BASE' }).maxSocios), { texto: '128 de 150 clientas activas', excedido: false });
  assert.deepEqual(usoDelTope(150, 150), { texto: '150 de 150 clientas activas', excedido: false });
});

test('pasarse se dice; no hay bloqueo que prometer', () => {
  assert.deepEqual(usoDelTope(152, 150), { texto: '152 de 150 clientas activas', excedido: true });
});

test('mientras no se sabe, «—» y nunca un cero', () => {
  assert.deepEqual(usoDelTope(null, 150), { texto: '— de 150 clientas activas', excedido: false });
});

test('un plan sin tope no tiene nada que contar', () => {
  assert.equal(usoDelTope(4000, entitlementsDe({ plan: 'ESTUDIO' }).maxSocios), null);
  assert.equal(usoDelTope(4000, Infinity), null);
});
