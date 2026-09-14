import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cuotaSinClienta } from './cuota-exige-clienta.ts';

test('una cuota sin clienta no se puede cobrar', () => {
  assert.equal(cuotaSinClienta(['MENSUAL'], null), true);
  assert.equal(cuotaSinClienta(['BONO', 'MENSUAL'], undefined), true);
});

test('con clienta, la cuota se cobra', () => {
  assert.equal(cuotaSinClienta(['MENSUAL'], 'soc-1'), false);
});

test('un bono o una clase suelta sin clienta SÍ (quedan «por asignar», a propósito)', () => {
  assert.equal(cuotaSinClienta(['BONO'], null), false);
  assert.equal(cuotaSinClienta(['PUNTUAL'], null), false);
  assert.equal(cuotaSinClienta([], null), false);
});

test('un plan cuyo tipo no se conoce no bloquea: decide el servidor, que sí lo lee', () => {
  assert.equal(cuotaSinClienta([undefined, null], null), false);
});
