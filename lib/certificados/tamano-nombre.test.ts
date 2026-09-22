import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tamanoNombreCertificado } from './tamano-nombre.ts';

test('tamanoNombreCertificado: nombre corto, el más grande', () => {
  assert.equal(tamanoNombreCertificado('PILATES BCN'), 76);
});

test('tamanoNombreCertificado: nombre medio, un escalón menos', () => {
  assert.equal(tamanoNombreCertificado('STUDIO PILATES BARCELONA'), 58);
});

test('tamanoNombreCertificado: nombre largo, más pequeño todavía', () => {
  assert.equal(tamanoNombreCertificado('CENTRO INTEGRAL DE PILATES Y MOVIMIENTO'), 44);
});

test('tamanoNombreCertificado: nombre extremadamente largo, el mínimo', () => {
  assert.equal(
    tamanoNombreCertificado('CENTRO INTEGRAL DE PILATES, YOGA, FISIOTERAPIA Y BIENESTAR DEL ÁREA METROPOLITANA'),
    32,
  );
});

test('tamanoNombreCertificado: es monótono decreciente con la longitud', () => {
  const nombres = ['A', 'AB CD EF GH', 'AB CD EF GH IJ KL MN OP QR', 'AB CD EF GH IJ KL MN OP QR ST UV WX YZ AB CD'];
  const tamanos = nombres.map(tamanoNombreCertificado);
  for (let i = 1; i < tamanos.length; i++) assert.ok(tamanos[i] <= tamanos[i - 1]);
});
