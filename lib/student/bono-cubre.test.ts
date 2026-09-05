import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bonoParaClase, cubreTipo, tieneBonoQueNoCubre } from './bono-cubre.ts';

const bono = (o: Partial<Parameters<typeof cubreTipo>[0]> = {}) => ({ estado: 'activo', creditosUsados: 0, creditosTotales: 10, ...o });

test('sin tipos declarados, el bono vale para cualquier clase', () => {
  assert.equal(cubreTipo(bono(), 'tc-reformer'), true);
  assert.equal(cubreTipo(bono({ tiposClaseIds: [] }), 'tc-reformer'), true);
});

test('acotado a Mat NO cubre un Reformer', () => {
  assert.equal(cubreTipo(bono({ tiposClaseIds: ['tc-mat'] }), 'tc-reformer'), false);
  assert.equal(cubreTipo(bono({ tiposClaseIds: ['tc-mat'] }), 'tc-mat'), true);
});

test('elige el bono que cubre, no el primero con saldo', () => {
  const soloMat = bono({ tiposClaseIds: ['tc-mat'] });
  const general = bono({ creditosUsados: 2 });
  // El de Mat va primero en la lista, pero la clase es Reformer.
  assert.equal(bonoParaClase([soloMat, general], 'tc-reformer'), general);
});

test('prefiere el ACOTADO cuando ambos sirven: no gasta el general en balde', () => {
  const soloMat = bono({ tiposClaseIds: ['tc-mat'] });
  const general = bono();
  assert.equal(bonoParaClase([general, soloMat], 'tc-mat'), soloMat);
});

test('sin bono que cubra, null — aunque tenga otros bonos', () => {
  assert.equal(bonoParaClase([bono({ tiposClaseIds: ['tc-mat'] })], 'tc-reformer'), null);
});

test('un bono agotado o caducado no cuenta; el ilimitado (totales 0) sí', () => {
  assert.equal(bonoParaClase([bono({ creditosUsados: 10, creditosTotales: 10 })], 'tc-x'), null);
  assert.equal(bonoParaClase([bono({ estado: 'caducado' })], 'tc-x'), null);
  assert.ok(bonoParaClase([bono({ creditosTotales: 0, creditosUsados: 99 })], 'tc-x'));
});

test('«tienes bono pero no vale aquí» se distingue de «no tienes bono»', () => {
  assert.equal(tieneBonoQueNoCubre([bono({ tiposClaseIds: ['tc-mat'] })], 'tc-reformer'), true);
  assert.equal(tieneBonoQueNoCubre([], 'tc-reformer'), false, 'sin bonos no es «no cubre»');
  assert.equal(tieneBonoQueNoCubre([bono()], 'tc-reformer'), false, 'con bono general sí cubre');
});
