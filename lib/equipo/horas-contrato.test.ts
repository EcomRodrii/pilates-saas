import { test } from 'node:test';
import assert from 'node:assert/strict';
import { equivalenteMensual, resumenHoras } from './horas-contrato.ts';

const AHORA = new Date('2026-09-15T12:00:00.000Z');
const clase = (dia: string, horas: number) => ({ inicio: new Date(dia), horas });

test('equivalente mensual usa la convención de 52 semanas entre 12 meses', () => {
  assert.equal(equivalenteMensual(12), 52);
  // 20 h/semana ≈ 86,67 h/mes, no 80: un mes no son cuatro semanas justas.
  assert.ok(Math.abs(equivalenteMensual(20) - 86.6667) < 0.001);
  assert.equal(equivalenteMensual(0), 0);
});

test('separa lo ya dado de lo que queda por dar', () => {
  const r = resumenHoras(
    [
      clase('2026-09-01T09:00:00.000Z', 1),
      clase('2026-09-10T09:00:00.000Z', 1.5),
      clase('2026-09-20T09:00:00.000Z', 2),
      clase('2026-09-28T09:00:00.000Z', 1),
    ],
    AHORA,
    null,
  );
  assert.equal(r.asignadas, 5.5);
  assert.equal(r.realizadas, 2.5);
  assert.equal(r.pendientes, 3);
});

test('sin contrato no se compara nada — null, nunca cero', () => {
  const r = resumenHoras([clase('2026-09-01T09:00:00.000Z', 4)], AHORA, null);
  assert.equal(r.contratoMes, null);
  assert.equal(r.diferencia, null);
});

test('un contrato de 0 h SÍ se compara: es distinto de no tener contrato', () => {
  const r = resumenHoras([clase('2026-09-01T09:00:00.000Z', 4)], AHORA, 0);
  assert.equal(r.contratoMes, 0);
  assert.equal(r.diferencia, 4);
});

test('la diferencia se mide contra lo ASIGNADO, no contra lo ya realizado', () => {
  // 12 h/semana = 52 h/mes. Tiene 60 asignadas pero solo 10 dadas todavía:
  // a mitad de mes lo que importa es que se ha comprometido a 8 h de más.
  const r = resumenHoras(
    [clase('2026-09-01T09:00:00.000Z', 10), clase('2026-09-25T09:00:00.000Z', 50)],
    AHORA,
    12,
  );
  assert.equal(r.asignadas, 60);
  assert.equal(r.realizadas, 10);
  assert.equal(r.contratoMes, 52);
  assert.equal(r.diferencia, 8);
});

test('por debajo de contrato da diferencia negativa', () => {
  const r = resumenHoras([clase('2026-09-02T09:00:00.000Z', 20)], AHORA, 12);
  assert.equal(r.diferencia, -32);
});

test('un mes sin clases con contrato sigue diciendo cuánto falta', () => {
  const r = resumenHoras([], AHORA, 12);
  assert.equal(r.asignadas, 0);
  assert.equal(r.realizadas, 0);
  assert.equal(r.pendientes, 0);
  assert.equal(r.diferencia, -52);
});

test('una clase que empieza justo ahora todavía no cuenta como realizada', () => {
  const r = resumenHoras([clase(AHORA.toISOString(), 1)], AHORA, null);
  assert.equal(r.realizadas, 0);
  assert.equal(r.pendientes, 1);
});
