import test from 'node:test';
import assert from 'node:assert/strict';
import { parsearOrigenPago, urlsDeRetorno } from './origen-pago.ts';

const APP = 'https://app.example.com';

test('la socia que paga desde su portal vuelve a su portal, no al panel', () => {
  // El bug: pagaba 175 € y aterrizaba en /login del panel de staff, con un
  // "¿Eres del equipo?" y sin confirmación de su pago.
  const u = urlsDeRetorno({ origen: 'portal', appUrl: APP, slug: 'mar', esCompraDePlan: false, reciboId: 'rec-1' });
  assert.equal(u.successUrl, `${APP}/portal/mar/compras?pago=ok`);
  assert.equal(u.cancelUrl, `${APP}/portal/mar/compras?pago=cancelado`);
  assert.doesNotMatch(u.successUrl, /\/cobros/);
});

test('el origen portal manda aunque sea una compra de plan', () => {
  const u = urlsDeRetorno({ origen: 'portal', appUrl: APP, slug: 'mar', esCompraDePlan: true });
  assert.match(u.successUrl, /\/portal\/mar\/compras/);
});

test('sin origen, un cobro de recibo sigue volviendo al panel (comportamiento de siempre)', () => {
  const u = urlsDeRetorno({ origen: undefined, appUrl: APP, slug: 'mar', esCompraDePlan: false, reciboId: 'rec-9' });
  assert.equal(u.successUrl, `${APP}/cobros?tab=pendientes&stripe_success=1&recibo=rec-9`);
  assert.equal(u.cancelUrl, `${APP}/cobros?tab=pendientes&stripe_cancel=1`);
});

test('sin origen, la compra de plan por enlace público sigue volviendo a /reservar', () => {
  const u = urlsDeRetorno({ origen: undefined, appUrl: APP, slug: 'mar', esCompraDePlan: true });
  assert.equal(u.successUrl, `${APP}/reservar/mar?compra=ok`);
  assert.equal(u.cancelUrl, `${APP}/reservar/mar?compra=cancelada`);
});

test('sin slug no se compone un portal roto: se cae al panel', () => {
  const u = urlsDeRetorno({ origen: 'portal', appUrl: APP, slug: null, esCompraDePlan: false, reciboId: 'rec-1' });
  assert.match(u.successUrl, /\/cobros/);
  assert.doesNotMatch(u.successUrl, /\/portal\//);
});

test('origen es una etiqueta, nunca una URL: nada de redirects abiertos', () => {
  // Lo que NO puede pasar es que el cuerpo de la petición decida a qué dominio
  // manda Stripe después de cobrar.
  for (const basura of [
    'https://evil.example.com', '//evil.example.com', '/cualquier/ruta',
    'PORTAL', '', null, undefined, 0, {}, ['portal'],
  ]) {
    assert.equal(parsearOrigenPago(basura), undefined, `debería rechazar ${JSON.stringify(basura) ?? 'undefined'}`);
  }
  assert.equal(parsearOrigenPago('portal'), 'portal');
  assert.equal(parsearOrigenPago('panel'), 'panel');
});

test('un origen no reconocido cae en el destino de siempre, no en uno vacío', () => {
  const u = urlsDeRetorno({
    origen: parsearOrigenPago('https://evil.example.com'),
    appUrl: APP, slug: 'mar', esCompraDePlan: false, reciboId: 'rec-1',
  });
  assert.match(u.successUrl, /^https:\/\/app\.example\.com\/cobros/);
});
