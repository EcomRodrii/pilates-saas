import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bizumPermitidoPara, ofrecerBizum, tipoDeReciboParaBizum } from './bizum-permitido.ts';

test('una cuota (mensual, trimestral o anual: todas son MENSUAL) no admite Bizum', () => {
  assert.equal(bizumPermitidoPara('MENSUAL'), false);
});

test('bono, clase suelta y cobros sin plan sí', () => {
  assert.equal(bizumPermitidoPara('BONO'), true);
  assert.equal(bizumPermitidoPara('PUNTUAL'), true);
  assert.equal(bizumPermitidoPara('SIN_PLAN'), true);
});

test('si no se sabe qué se cobra, tampoco: la tarjeta siempre sirve', () => {
  assert.equal(bizumPermitidoPara(null), false);
  assert.equal(bizumPermitidoPara(undefined), false);
});

test('un recibo ya entregado como MENSUAL es de cuota sin consultar', () => {
  assert.equal(tipoDeReciboParaBizum('MENSUAL', 'sus-1'), 'MENSUAL');
});

test('⚠️ NINGUNA con suscripción NO es «sin plan»: se consulta el plan', () => {
  // `NINGUNA` = «el cobro no entregó nada», no «no cuelga de ningún plan». El
  // primer recibo de una cuota asignada desde la ficha lo lleva; marcado
  // DEVUELTO vuelve a ser cobrable, y como atajo ofrecía Bizum en una cuota.
  assert.equal(tipoDeReciboParaBizum('NINGUNA', 'sus-1'), 'CONSULTAR_PLAN');
});

test('con suscripción, cualquier otro valor (NULL de un pendiente, BONO, ALTA_WEB) se consulta', () => {
  assert.equal(tipoDeReciboParaBizum(null, 'sus-1'), 'CONSULTAR_PLAN');
  assert.equal(tipoDeReciboParaBizum('BONO', 'sus-1'), 'CONSULTAR_PLAN');
  assert.equal(tipoDeReciboParaBizum('ALTA_WEB', 'sus-1'), 'CONSULTAR_PLAN');
});

test('sin suscripción (una penalización) no cuelga de ningún plan', () => {
  assert.equal(tipoDeReciboParaBizum(null, null), 'SIN_PLAN');
  assert.equal(tipoDeReciboParaBizum('NINGUNA', null), 'SIN_PLAN');
});

test('la puerta del checkout: Bizum solo si se pide Y el plan lo admite', () => {
  assert.equal(ofrecerBizum(false, 'BONO'), false);
  assert.equal(ofrecerBizum(true, 'BONO'), true);
  assert.equal(ofrecerBizum(true, 'SIN_PLAN'), true);
  assert.equal(ofrecerBizum(true, 'MENSUAL'), false);
  assert.equal(ofrecerBizum(true, null), false);
});
