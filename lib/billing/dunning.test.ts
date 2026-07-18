import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planificarTrasFallo, primerReintentoISO, MAX_REINTENTOS, OFFSETS_REINTENTO_DIAS } from './dunning.ts';

const VENC = '2026-07-01';

test('primer reintento se programa al día +1 del vencimiento', () => {
  assert.equal(primerReintentoISO(VENC), '2026-07-02T00:00:00.000Z');
});

test('1er fallo → intentos=1, sigue PENDIENTE, próximo reintento al +3, marcado como primer fallo', () => {
  const p = planificarTrasFallo(0, VENC);
  assert.equal(p.intentos, 1);
  assert.equal(p.estado, 'PENDIENTE');
  assert.equal(p.proximoReintento, '2026-07-04T00:00:00.000Z'); // +3
  assert.equal(p.esPrimerFallo, true);
  assert.equal(p.esDefinitivo, false);
});

test('2.º fallo → intentos=2, PENDIENTE, próximo reintento al +7, no es primer fallo ni definitivo', () => {
  const p = planificarTrasFallo(1, VENC);
  assert.equal(p.intentos, 2);
  assert.equal(p.estado, 'PENDIENTE');
  assert.equal(p.proximoReintento, '2026-07-08T00:00:00.000Z'); // +7
  assert.equal(p.esPrimerFallo, false);
  assert.equal(p.esDefinitivo, false);
});

test('3.er fallo → intentos=3, FALLIDO, sin próximo reintento, es definitivo', () => {
  const p = planificarTrasFallo(2, VENC);
  assert.equal(p.intentos, 3);
  assert.equal(p.estado, 'FALLIDO');
  assert.equal(p.proximoReintento, null);
  assert.equal(p.esPrimerFallo, false);
  assert.equal(p.esDefinitivo, true);
});

test('hay exactamente 3 reintentos antes de FALLIDO', () => {
  assert.equal(MAX_REINTENTOS, 3);
  assert.equal(OFFSETS_REINTENTO_DIAS.length, 3);
  // simulación completa desde 0 fallos
  let intentos = 0;
  const estados: string[] = [];
  for (let i = 0; i < MAX_REINTENTOS; i++) {
    const p = planificarTrasFallo(intentos, VENC);
    intentos = p.intentos;
    estados.push(p.estado);
  }
  assert.deepEqual(estados, ['PENDIENTE', 'PENDIENTE', 'FALLIDO']);
});

test('intentos_reintento negativo o nulo se normaliza (defensivo)', () => {
  const p = planificarTrasFallo(-5, VENC);
  assert.equal(p.intentos, 1);
  assert.equal(p.esPrimerFallo, true);
});
