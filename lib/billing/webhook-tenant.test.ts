import test from 'node:test';
import assert from 'node:assert/strict';
import { tenantAutorizado } from './webhook-tenant.ts';

// El bug era una condición que cortocircuitaba cuando el estudio VÍCTIMA no
// tenía Stripe conectado — 7 de los 9 estudios de producción. Estos casos son
// la tabla de verdad que no se puede volver a torcer.

test('la cuenta que firma y la metadata coinciden: autorizado', () => {
  assert.equal(tenantAutorizado('studio-a', 'studio-a'), true);
});

test('⚠️ el caso del bug: la cuenta dice A y la metadata dice B', () => {
  // Estudio A crea el checkout en SU cuenta con el recibo de B y paga a su
  // propia cuenta. Antes esto marcaba el recibo de B COBRADO.
  assert.equal(tenantAutorizado('studio-a', 'studio-b'), false);
});

test('⚠️ el caso del bug, versión que se colaba: víctima SIN Stripe conectado', () => {
  // `studioDeCuenta` null = la cuenta que firma no resuelve a ningún estudio, o
  // el estudio de la metadata no tiene cuenta. La condición vieja
  // (`&& studioRow?.stripe_account_id && …`) se saltaba entera justo aquí.
  assert.equal(tenantAutorizado(null, 'studio-b'), false, 'sin cuenta reconocida NO se autoriza');
});

test('sin cuenta en el evento no se autoriza nada', () => {
  // Un evento de pago sin `event.account` no puede venir de un direct charge:
  // el checkout se crea SIEMPRE con `{ stripeAccount }`.
  assert.equal(tenantAutorizado(null, null), false);
  assert.equal(tenantAutorizado(null, undefined), false);
});

test('cuenta reconocida y metadata ausente: se autoriza al estudio de la cuenta', () => {
  // La cuenta es la autoridad; la metadata solo confirma. Si no viene, no hay
  // nada que contradecir.
  assert.equal(tenantAutorizado('studio-a', null), true);
  assert.equal(tenantAutorizado('studio-a', undefined), true);
  assert.equal(tenantAutorizado('studio-a', ''), true);
});
