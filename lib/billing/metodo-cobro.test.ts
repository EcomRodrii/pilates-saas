import { test } from 'node:test';
import assert from 'node:assert/strict';
import { elegirMetodoCobro } from './metodo-cobro.ts';

test('SEPA preferido y listo → SEPA con su mandato', () => {
  const r = elegirMetodoCobro({
    metodo_pago_preferido: 'SEPA',
    sepa_payment_method_id: 'pm_sepa',
    sepa_mandate_id: 'mandate_1',
    stripe_payment_method_id: 'pm_card',
  });
  assert.deepEqual(r, { ok: true, metodo: 'SEPA', paymentMethodId: 'pm_sepa', mandateId: 'mandate_1' });
});

test('SEPA preferido pero SIN mandato listo → cae a tarjeta', () => {
  const r = elegirMetodoCobro({
    metodo_pago_preferido: 'SEPA',
    sepa_payment_method_id: null,
    stripe_payment_method_id: 'pm_card',
  });
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.metodo, 'TARJETA');
});

test('preferencia TARJETA (o sin preferencia) → tarjeta aunque tenga SEPA', () => {
  const r = elegirMetodoCobro({
    metodo_pago_preferido: 'TARJETA',
    sepa_payment_method_id: 'pm_sepa',
    sepa_mandate_id: 'mandate_1',
    stripe_payment_method_id: 'pm_card',
  });
  assert.equal(r.ok && r.metodo, 'TARJETA');
});

test('sin preferencia explícita pero solo tiene SEPA → SEPA (último recurso)', () => {
  const r = elegirMetodoCobro({
    metodo_pago_preferido: null,
    sepa_payment_method_id: 'pm_sepa',
    sepa_mandate_id: 'mandate_1',
    stripe_payment_method_id: null,
  });
  assert.equal(r.ok && r.metodo, 'SEPA');
  assert.equal(r.ok && r.metodo === 'SEPA' && r.mandateId, 'mandate_1');
});

test('SEPA sin mandate_id explícito → mandateId null (Stripe usará el del PM)', () => {
  const r = elegirMetodoCobro({
    metodo_pago_preferido: 'SEPA',
    sepa_payment_method_id: 'pm_sepa',
  });
  assert.equal(r.ok && r.metodo === 'SEPA' && r.mandateId, null);
});

test('sin ningún método → no se puede cobrar', () => {
  const r = elegirMetodoCobro({ metodo_pago_preferido: 'TARJETA' });
  assert.deepEqual(r, { ok: false, motivo: 'SIN_METODO' });
});
