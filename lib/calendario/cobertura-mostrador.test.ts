import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lineaCoberturaMostrador } from './cobertura-mostrador.ts';

test('con bono dice cuánto le queda en total, en singular cuando es la última', () => {
  assert.deepEqual(lineaCoberturaMostrador({ estado: 'BONO', planNombre: 'Bono 10 clases', sesionesRestantes: 3 }),
    { texto: 'Bono 10 clases · le quedan 3', sinCobertura: false });
  assert.equal(lineaCoberturaMostrador({ estado: 'BONO', planNombre: 'Bono 5', sesionesRestantes: 1 }).texto, 'Bono 5 · le queda 1');
});

test('con cuota viene cubierta, sin hablar de sesiones', () => {
  assert.deepEqual(lineaCoberturaMostrador({ estado: 'MENSUAL', planNombre: 'Cuota mensual' }),
    { texto: 'Con su Cuota mensual', sinCobertura: false });
});

test('sin plan, o con uno que no cubre esta clase, hay que cobrársela', () => {
  assert.equal(lineaCoberturaMostrador({ estado: 'SIN_PLAN', precio: 15 }).sinCobertura, true);
  assert.equal(lineaCoberturaMostrador({ estado: 'NO_CUBRE_ESTA_CLASE', precio: 15 }).texto, 'Su bono o su cuota no cubren esta clase');
  assert.equal(lineaCoberturaMostrador({ estado: 'SIN_PLAN', precio: null }).texto, 'No tiene bono ni cuota que valga para esta clase');
});
