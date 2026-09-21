import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AnalisisCapacidad } from './capacidad.ts';
import { notaEstimacion } from './textos.ts';

const conMotivos = (estimadas: number, m: Partial<AnalisisCapacidad['estimadasPorMotivo']>) => ({
  desglose: { OBSERVADA: { suscripciones: 0, plazas: 0 }, ESTIMADA_POR_PLAN: { suscripciones: estimadas, plazas: 0 } },
  estimadasPorMotivo: { TOPE_PLAN: 0, SIN_TOPE: 0, BONO: 0, PUNTUAL: 0, ...m },
}) as AnalisisCapacidad;

test('un estudio que solo vende bonos no lee nada de «2 clases por semana»', () => {
  const t = notaEstimacion(conMotivos(3, { BONO: 3 }), 2);
  assert.equal(t, '3 de tus cuotas aún no tienen historial: las estimamos por su plan (los 3 bonos, repartiendo lo que les queda hasta que caducan).');
  assert.ok(!t.includes('por semana'));
});

test('mezcla: nombra cada supuesto usado y solo esos', () => {
  const t = notaEstimacion(conMotivos(4, { BONO: 1, TOPE_PLAN: 2, SIN_TOPE: 1 }), 2);
  assert.equal(t, '4 de tus cuotas aún no tienen historial: las estimamos por su plan (el bono, repartiendo lo que le queda hasta que caduca; las 2 cuotas con tope, a su tope semanal; la ilimitada, a 2 clases por semana).');
});

test('singular cuando es una sola cuota', () => {
  assert.equal(
    notaEstimacion(conMotivos(1, { SIN_TOPE: 1 }), 3),
    '1 de tus cuotas aún no tiene historial: la estimamos por su plan (la ilimitada, a 3 clases por semana).',
  );
});
