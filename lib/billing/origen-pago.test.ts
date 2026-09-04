import test from 'node:test';
import assert from 'node:assert/strict';
import { parsearOrigenPago, urlsDeRetorno } from './origen-pago.ts';

const APP = 'https://app.example.com';

test('la socia que paga desde su portal vuelve a su portal, no al panel', () => {
  // El bug: pagaba 175 € y aterrizaba en /login del panel de staff, con un
  // "¿Eres del equipo?" y sin confirmación de su pago.
  const u = urlsDeRetorno({ origen: 'portal', appUrl: APP, slug: 'mar', esCompraDePlan: false, reciboId: 'rec-1' });
  assert.equal(u.successUrl, `${APP}/portal/mar/pagos?pago=ok`);
  assert.equal(u.cancelUrl, `${APP}/portal/mar/pagos?pago=cancelado`);
  assert.doesNotMatch(u.successUrl, /\/cobros/);
});

test('comprar un bono desde el portal termina en «Mis bonos», con el plan que se compró', () => {
  const r = urlsDeRetorno({
    origen: 'portal', appUrl: 'https://x.app', slug: 'estudio', esCompraDePlan: true, planId: 'p1',
  });
  assert.equal(r.successUrl, 'https://x.app/portal/estudio/bonos?compra=ok&plan=p1');
  assert.equal(r.cancelUrl, 'https://x.app/portal/estudio/bonos?compra=cancelada');
});

test('pagar un RECIBO desde el portal sigue yendo al historial: una factura no es un bono', () => {
  const r = urlsDeRetorno({
    origen: 'portal', appUrl: 'https://x.app', slug: 'estudio', esCompraDePlan: false, reciboId: 'r1',
  });
  assert.equal(r.successUrl, 'https://x.app/portal/estudio/pagos?pago=ok');
});

test('sin planId no se compone un `&plan=` vacío que la pantalla tendría que descartar', () => {
  const r = urlsDeRetorno({ origen: 'portal', appUrl: 'https://x.app', slug: 'estudio', esCompraDePlan: true });
  assert.equal(r.successUrl, 'https://x.app/portal/estudio/bonos?compra=ok');
});

test('el planId va escapado: es un id de la BD, pero nadie compone URLs a pelo aquí', () => {
  const r = urlsDeRetorno({
    origen: 'portal', appUrl: 'https://x.app', slug: 'estudio', esCompraDePlan: true, planId: 'a b&c',
  });
  assert.ok(r.successUrl.endsWith('&plan=a%20b%26c'));
});

test('el origen portal manda aunque sea una compra de plan: nunca al enlace público', () => {
  const u = urlsDeRetorno({ origen: 'portal', appUrl: APP, slug: 'mar', esCompraDePlan: true });
  // Lo que este test defiende es que `origen: 'portal'` gana a la regla del
  // enlace público (`/reservar`). El destino dentro del portal cambió —era
  // `/compras`, ahora «Mis bonos»— y esa parte la cubre su propio test.
  assert.match(u.successUrl, /\/portal\/mar\//);
  assert.doesNotMatch(u.successUrl, /\/reservar\//);
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
