import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planLimitaSemanaDeClase } from '../bono-logic.ts';
import type { PlanTarifa } from '../types.ts';

const plan = (p: Partial<PlanTarifa>): PlanTarifa => ({
  id: 'p1', studioId: 'e1', nombre: 'Mensual 2 días', descripcion: null, precio: 60, tipo: 'MENSUAL',
  sesiones: null, validezDias: null, limiteSemanal: null, activo: true, ...p,
}) as PlanTarifa;

test('con límite semanal que cubre la clase, una recuperación le sirve', () => {
  assert.equal(planLimitaSemanaDeClase(plan({ limiteSemanal: 2 }), 'tc-reformer'), true);
});

test('sin límite semanal no le sirve: puede volver a reservar sin tope', () => {
  assert.equal(planLimitaSemanaDeClase(plan({ limiteSemanal: null }), 'tc-reformer'), false);
  assert.equal(planLimitaSemanaDeClase(plan({ limiteSemanal: 0 }), 'tc-reformer'), false);
});

test('un plan que no cubre la clase no cuenta aunque tenga límite', () => {
  const soloMat = plan({ limiteSemanal: 2, tiposClaseIds: ['tc-mat'] });
  assert.equal(planLimitaSemanaDeClase(soloMat, 'tc-reformer'), false);
  assert.equal(planLimitaSemanaDeClase(soloMat, 'tc-mat'), true);
});

test('solo sublímites por actividad, sin techo total: no reparte (mismo criterio que el barrido)', () => {
  const combinada = plan({ limiteSemanal: null, tiposClaseIds: ['tc-maq'], limitePorTipo: { 'tc-maq': 2 } });
  assert.equal(planLimitaSemanaDeClase(combinada, 'tc-maq'), false);
});
