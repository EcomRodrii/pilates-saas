import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planificarTrasFallo, primerReintentoISO, MAX_REINTENTOS, OFFSETS_REINTENTO_DIAS } from './dunning.ts';

const VENC = '2026-07-01';
// La cadencia se ancla al más tardío entre el vencimiento y "ahora"; para probar el
// caso normal (el fallo ocurre en torno al vencimiento) se fija ahora = VENC, así la
// base es el vencimiento y valen los offsets +3/+7 clásicos.

test('primer reintento se programa al día +1 del vencimiento', () => {
  assert.equal(primerReintentoISO(VENC), '2026-07-02T00:00:00.000Z');
});

test('1er fallo → intentos=1, sigue PENDIENTE, próximo reintento al +3, marcado como primer fallo', () => {
  const p = planificarTrasFallo(0, VENC, VENC);
  assert.equal(p.intentos, 1);
  assert.equal(p.estado, 'PENDIENTE');
  assert.equal(p.proximoReintento, '2026-07-04T00:00:00.000Z'); // +3
  assert.equal(p.esPrimerFallo, true);
  assert.equal(p.esDefinitivo, false);
});

test('2.º fallo → intentos=2, PENDIENTE, próximo reintento al +7, no es primer fallo ni definitivo', () => {
  const p = planificarTrasFallo(1, VENC, VENC);
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

test('vencimiento en el pasado → la cadencia se ancla a "ahora", los reintentos no colapsan', () => {
  const ahora = '2026-07-25T10:00:00.000Z';
  const vencPasado = '2024-01-01'; // renovación de una suscripción caducada hace tiempo
  const f1 = planificarTrasFallo(0, vencPasado, ahora);
  const f2 = planificarTrasFallo(1, vencPasado, ahora);
  // Sin el ancla, f1/f2 caerían en 2024 (pasado) y el barrido diario los dispararía
  // casi seguidos, quemando la ventana de recuperación.
  assert.ok(new Date(f1.proximoReintento!) > new Date(ahora), 'el 1er reintento debe ser futuro');
  assert.ok(new Date(f2.proximoReintento!) > new Date(f1.proximoReintento!), 'el 2º va después del 1º');
  assert.equal(f1.proximoReintento, '2026-07-28T10:00:00.000Z'); // ahora +3
  assert.equal(f2.proximoReintento, '2026-08-01T10:00:00.000Z'); // ahora +7
});
