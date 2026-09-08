import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saldoEstaVivo, saldoVivo, diasHastaCaducar } from './creditos-caducidad.ts';

const HOY = '2026-09-08';

test('sin fecha de caducidad, el saldo no caduca nunca', () => {
  assert.equal(saldoEstaVivo(null, HOY), true);
  assert.equal(saldoEstaVivo(undefined, HOY), true);
  assert.equal(saldoVivo(500, null, HOY), 500);
});

test('el día de la caducidad TODAVÍA se puede gastar', () => {
  // Igual que en SQL (`caduca_el >= current_date`). Si aquí fuera `>`, la
  // pantalla diría 0 y el servidor aceptaría el canje: divergencia justo el
  // día que más se nota.
  assert.equal(saldoEstaVivo(HOY, HOY), true);
  assert.equal(saldoVivo(500, HOY, HOY), 500);
});

test('pasada la fecha, el saldo vale cero aunque siga guardado', () => {
  assert.equal(saldoEstaVivo('2026-09-07', HOY), false);
  // 500 guardados, 0 gastables: es la diferencia que evita enseñar un saldo
  // que el servidor va a rechazar.
  assert.equal(saldoVivo(500, '2026-09-07', HOY), 0);
});

test('los días que faltan salen de comparar fechas, no de husos horarios', () => {
  assert.equal(diasHastaCaducar('2026-09-15', HOY), 7);
  assert.equal(diasHastaCaducar(HOY, HOY), 0);
  // Ya caducado o sin caducidad: no hay nada que avisar.
  assert.equal(diasHastaCaducar('2026-09-07', HOY), null);
  assert.equal(diasHastaCaducar(null, HOY), null);
});

test('el cambio de mes y el de año no descuadran la cuenta', () => {
  assert.equal(diasHastaCaducar('2026-10-01', '2026-09-30'), 1);
  assert.equal(diasHastaCaducar('2027-01-01', '2026-12-31'), 1);
  // Y un salto largo que cruza el cambio de hora de octubre: si esto se
  // calculara con Date local, saldría 30,958… y redondearía mal.
  assert.equal(diasHastaCaducar('2026-11-01', '2026-10-01'), 31);
});
