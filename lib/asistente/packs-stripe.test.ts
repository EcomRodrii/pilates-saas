import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decidirAcreditacion, disputaRetiraElPack, efectoDelReembolso, eventoDePack, type SesionPackLike } from './packs-stripe.ts';

const sesion = (o: Partial<SesionPackLike> = {}): SesionPackLike => ({
  id: 'cs_test_a1', mode: 'payment', payment_status: 'paid', amount_total: 2400, currency: 'eur',
  metadata: { origen: 'ia_pack', studio_id: 'studio-x', pack: '300' }, payment_intent: 'pi_1', client_reference_id: 'studio-x', ...o,
});

test('pagado con tarjeta: se acredita con lo cobrado y la sesión como identidad', () => {
  assert.deepEqual(decidirAcreditacion(sesion()), {
    accion: 'acreditar', studioId: 'studio-x', unidades: 300, precioEur: 24, sessionId: 'cs_test_a1', paymentIntentId: 'pi_1', importeDistinto: false,
  });
  const conObjeto = decidirAcreditacion(sesion({ payment_intent: { id: 'pi_2' } }));
  assert.equal(conObjeto.accion === 'acreditar' && conObjeto.paymentIntentId, 'pi_2');
});

test('sin pagar todavía (SEPA en curso): se espera a async_payment_succeeded, sin escribir nada', () => {
  assert.deepEqual(decidirAcreditacion(sesion({ payment_status: 'unpaid' })), { accion: 'esperar' });
  assert.deepEqual(decidirAcreditacion(sesion({ payment_status: 'no_payment_required' })), { accion: 'esperar' });
});

test('lo que no es un pack no se toca: la suscripción SaaS y los pagos de socias', () => {
  assert.deepEqual(decidirAcreditacion(sesion({ metadata: { studioId: 'studio-x', plan: 'ESTUDIO' } })), { accion: 'no_es_pack' });
  assert.deepEqual(decidirAcreditacion(sesion({ metadata: { reciboId: 'r1', origen: 'recibo' } })), { accion: 'no_es_pack' });
  assert.deepEqual(decidirAcreditacion(sesion({ metadata: null })), { accion: 'no_es_pack' });
});

test('un pack mal formado no se acredita (y el webhook lo avisa)', () => {
  assert.deepEqual(decidirAcreditacion(sesion({ mode: 'subscription' })), { accion: 'invalido', motivo: 'modo' });
  assert.deepEqual(decidirAcreditacion(sesion({ metadata: { origen: 'ia_pack', pack: '300' } })), { accion: 'invalido', motivo: 'sin_estudio' });
  assert.deepEqual(decidirAcreditacion(sesion({ metadata: { origen: 'ia_pack', studio_id: 's', pack: '5000' } })), { accion: 'invalido', motivo: 'pack_desconocido' });
  assert.deepEqual(decidirAcreditacion(sesion({ currency: 'usd' })), { accion: 'invalido', motivo: 'importe' });
  assert.deepEqual(decidirAcreditacion(sesion({ amount_total: 0 })), { accion: 'invalido', motivo: 'importe' });
});

test('importe: de más se acredita y se avisa; de menos, o con otra referencia de estudio, no', () => {
  const d = decidirAcreditacion(sesion({ amount_total: 2600 }));
  assert.equal(d.accion === 'acreditar' && d.importeDistinto, true);
  assert.equal(d.accion === 'acreditar' && d.precioEur, 26);
  assert.deepEqual(decidirAcreditacion(sesion({ amount_total: 2200 })), { accion: 'invalido', motivo: 'importe_inferior' });
  assert.deepEqual(decidirAcreditacion(sesion({ client_reference_id: 'otro' })), { accion: 'invalido', motivo: 'referencia' });
  assert.deepEqual(decidirAcreditacion(sesion({ client_reference_id: null })), { accion: 'invalido', motivo: 'referencia' });
});

test('el webhook de Connect reconoce un evento de pack en sesión, PaymentIntent o cargo', () => {
  for (const object of [{ metadata: { origen: 'ia_pack' } }, { object: 'payment_intent', metadata: { origen: 'ia_pack', studio_id: 'x' } }]) {
    assert.equal(eventoDePack({ type: 'x', data: { object } }), true);
  }
  assert.equal(eventoDePack({ type: 'checkout.session.completed', data: { object: { metadata: { reciboId: 'r' } } } }), false);
  assert.equal(eventoDePack({ type: 'charge.refunded', data: { object: { metadata: {} } } }), false);
  assert.equal(eventoDePack({ type: 'x', data: { object: null } }), false);
});

test('reembolso TOTAL y disputa PERDIDA retiran el pack; un parcial se avisa y no lo toca; una disputa ganada, nada', () => {
  assert.equal(efectoDelReembolso({ refunded: true, amount_refunded: 2400, amount: 2400 }), 'retirar');
  assert.equal(efectoDelReembolso({ refunded: false, amount_refunded: 2400, amount: 2400 }), 'retirar');
  assert.equal(efectoDelReembolso({ refunded: false, amount_refunded: 100, amount: 2400 }), 'parcial');
  assert.equal(efectoDelReembolso({ refunded: false, amount_refunded: 0, amount: 2400 }), 'nada');
  assert.equal(disputaRetiraElPack({ status: 'lost' }), true);
  for (const status of ['won', 'warning_closed', 'needs_response', null]) assert.equal(disputaRetiraElPack({ status }), false, String(status));
});
