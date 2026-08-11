import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paramsReembolso } from './reembolso-params.ts';

// Regresión de un fallo REAL en producción (11-ago-2026): la primera devolución
// que intentó el estudio murió con
//   «Attempting to refund_application_fee on ch_…, but it has no application fee»
// porque la bandera iba puesta siempre y el take-rate está apagado.

test('sin comisión de plataforma NO se manda refund_application_fee', () => {
  const p = paramsReembolso('pi_123', null);
  assert.deepEqual(p, { payment_intent: 'pi_123' });
  // `deepEqual` con `undefined` no basta: Stripe recibe la CLAVE aunque valga
  // undefined si se construye con `refund_application_fee: undefined`, y el
  // error saltaría igual. Se comprueba que la clave no exista.
  assert.equal('refund_application_fee' in p, false);
});

test('comisión 0 tampoco cuenta como comisión', () => {
  // `applicationFeeAmount()` devuelve 0 cuando el take-rate está a cero, no
  // undefined. Tratarlo como "hay comisión" reproduce el mismo error.
  assert.equal('refund_application_fee' in paramsReembolso('pi_123', 0), false);
});

test('undefined (el caso de un PI sin el campo) tampoco', () => {
  assert.equal('refund_application_fee' in paramsReembolso('pi_123', undefined), false);
});

test('con comisión SÍ se devuelve también la comisión', () => {
  // Si no, el estudio devuelve el importe entero y encima paga la comisión de
  // una venta que ya no existe.
  assert.deepEqual(paramsReembolso('pi_123', 150), {
    payment_intent: 'pi_123',
    refund_application_fee: true,
  });
});

test('el payment_intent viaja tal cual en ambos casos', () => {
  assert.equal(paramsReembolso('pi_abc', null).payment_intent, 'pi_abc');
  assert.equal(paramsReembolso('pi_abc', 99).payment_intent, 'pi_abc');
});
