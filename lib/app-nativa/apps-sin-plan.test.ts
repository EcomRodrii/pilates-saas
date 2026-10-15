import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DIAS_MARGEN_SIN_PLAN, accionSinPlan, finDelMargen, pagaLaApp } from './apps-sin-plan.ts';

const ahora = new Date('2026-11-01T10:00:00Z');
const PAGA = { plan: 'ESTUDIO', estado: 'active' };

test('la paga quien tiene Estudio o Cadena activo; Founding, la prueba o un cobro pendiente, no', () => {
  assert.equal(pagaLaApp(PAGA), true);
  assert.equal(pagaLaApp({ plan: 'CADENA', estado: 'active' }), true);
  assert.equal(pagaLaApp({ plan: 'BASE', estado: 'active' }), false);
  for (const e of ['past_due', 'trialing', 'gratis', 'canceled', null]) assert.equal(pagaLaApp({ plan: 'ESTUDIO', estado: e }), false, String(e));
});

test('deja de pagarla: empieza el margen de 30 días', () => {
  const a = accionSinPlan({ estado: 'PUBLICADA', sinPlanDesde: null }, { plan: 'BASE', estado: 'gratis' }, ahora);
  assert.equal(a.tipo, 'empieza');
  assert.equal(a.tipo === 'empieza' && a.hasta.toISOString(), finDelMargen(ahora).toISOString());
  assert.equal(DIAS_MARGEN_SIN_PLAN, 30);
});

test('dentro del margen no pasa nada; al acabar, se retira', () => {
  const desde = new Date(ahora.getTime() - 29 * 864e5).toISOString();
  assert.deepEqual(accionSinPlan({ estado: 'PUBLICADA', sinPlanDesde: desde }, { plan: 'BASE', estado: 'gratis' }, ahora), { tipo: 'nada' });
  const vencido = new Date(ahora.getTime() - 30 * 864e5).toISOString();
  assert.deepEqual(accionSinPlan({ estado: 'PUBLICADA', sinPlanDesde: vencido }, { plan: 'BASE', estado: 'gratis' }, ahora), { tipo: 'retirar' });
});

test('vuelve a pagarla: se borra el margen (también si ya estaba pausada)', () => {
  const desde = new Date(ahora.getTime() - 10 * 864e5).toISOString();
  assert.deepEqual(accionSinPlan({ estado: 'PUBLICADA', sinPlanDesde: desde }, PAGA, ahora), { tipo: 'vuelve' });
  assert.deepEqual(accionSinPlan({ estado: 'PAUSADA', sinPlanDesde: desde }, PAGA, ahora), { tipo: 'vuelve' });
  assert.deepEqual(accionSinPlan({ estado: 'PUBLICADA', sinPlanDesde: null }, PAGA, ahora), { tipo: 'nada' });
});

test('una ya pausada no se vuelve a retirar ni a avisar', () => {
  assert.deepEqual(accionSinPlan({ estado: 'PAUSADA', sinPlanDesde: null }, { plan: 'BASE', estado: 'gratis' }, ahora), { tipo: 'nada' });
});
