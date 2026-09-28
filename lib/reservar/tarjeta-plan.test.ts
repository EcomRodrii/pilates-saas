import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resumenPlan, maquetaPlanes, precioEnEuros } from './tarjeta-plan.ts';

test('bono: precio por clase y caducidad en meses, semanas o días', () => {
  assert.deepEqual(resumenPlan({ tipo: 'BONO', precio: 64, sesiones: 4, validezDias: 60 }), {
    tipo: 'bono', porClase: '16 € / clase', vigencia: '2 meses', sufijoPrecio: '',
  });
  assert.equal(resumenPlan({ tipo: 'BONO', precio: 70, sesiones: 4, validezDias: 30 }).porClase, '17,50 € / clase');
  assert.equal(resumenPlan({ tipo: 'BONO', precio: 70, sesiones: 4, validezDias: 30 }).vigencia, '1 mes');
  assert.equal(resumenPlan({ tipo: 'BONO', precio: 70, sesiones: 4, validezDias: 14 }).vigencia, '2 semanas');
  assert.equal(resumenPlan({ tipo: 'BONO', precio: 70, sesiones: 4, validezDias: 45 }).vigencia, '45 días');
});

test('sin caducidad se dice; nunca se inventa una', () => {
  for (const validezDias of [null, undefined, 0]) {
    assert.equal(resumenPlan({ tipo: 'BONO', precio: 100, sesiones: 10, validezDias }).vigencia, 'Sin caducidad');
  }
});

test('clase suelta: sin «por clase» (sería el mismo precio dos veces)', () => {
  const r = resumenPlan({ tipo: 'PUNTUAL', precio: 18, sesiones: 1, validezDias: null });
  assert.equal(r.tipo, 'suelta');
  assert.equal(r.porClase, null);
  assert.equal(r.vigencia, '1 clase · Sin caducidad');
});

test('cuota: cada cuánto se cobra, con su sufijo, y sin «por clase»', () => {
  assert.deepEqual(resumenPlan({ tipo: 'MENSUAL', precio: 89, sesiones: null, periodicidadMeses: 1 }), {
    tipo: 'cuota', porClase: null, vigencia: 'Cada mes · sin compromiso', sufijoPrecio: '/mes',
  });
  assert.equal(resumenPlan({ tipo: 'MENSUAL', precio: 240, sesiones: null, periodicidadMeses: 3 }).sufijoPrecio, '/trimestre');
});

test('plan gratis o sin sesiones: sin «por clase»', () => {
  assert.equal(resumenPlan({ tipo: 'BONO', precio: 0, sesiones: 4, validezDias: 30 }).porClase, null);
  assert.equal(resumenPlan({ tipo: 'BONO', precio: 50, sesiones: null, validezDias: 30 }).porClase, null);
});

test('lista si se vende un solo tipo; columnas si se comparan varios', () => {
  assert.equal(maquetaPlanes(['BONO']), 'lista');
  assert.equal(maquetaPlanes(['BONO', 'MENSUAL']), 'columnas');
  assert.equal(maquetaPlanes([]), 'columnas');
});

test('precio en euros: sin decimales si es entero', () => {
  assert.equal(precioEnEuros(64), '64 €');
  assert.equal(precioEnEuros(17.5), '17,50 €');
});
