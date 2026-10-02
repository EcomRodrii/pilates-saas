import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comoSeLePuedeCobrar } from './medio-de-cobro.ts';

const AHORA = new Date('2026-10-02T10:00:00Z');
const base = { estudioConStripe: true, estudioHaceRemesas: false, mandatosCargados: true, tieneMandatoVigente: false, ahora: AHORA };
const VISA = { stripeCustomerId: 'cus_1', stripePaymentMethodId: 'pm_1', tarjetaMarca: 'visa', tarjetaUltimos4: '0077', tarjetaExpMes: 5, tarjetaExpAnio: 2027 };

const listo = (o: Parameters<typeof comoSeLePuedeCobrar>[0]) => {
  const m = comoSeLePuedeCobrar(o);
  assert.equal(m.estado, 'LISTO');
  return m as Extract<typeof m, { estado: 'LISTO' }>;
};

test('tarjeta válida con Stripe: se le puede cobrar con ella y se puede cambiar', () => {
  const m = listo({ ...base, clienta: VISA });
  assert.deepEqual(m.online, { metodo: 'TARJETA', boton: 'Cobrar con su tarjeta ··0077' });
  assert.equal(m.pedirTarjeta, 'CAMBIAR');
  assert.deepEqual(m.lineas, ['Visa ··0077 · caduca 05/2027']);
  assert.equal(m.aviso, null);
});

test('tarjeta caducada: no se ofrece cobrarle con ella, se le pide una nueva y se dice cuándo caducó', () => {
  const m = listo({ ...base, clienta: { ...VISA, tarjetaExpMes: 9, tarjetaExpAnio: 2026 } });
  assert.equal(m.online, null);
  assert.equal(m.pedirTarjeta, 'PEDIR_NUEVA');
  assert.equal(m.aviso, 'Caducó en septiembre de 2026');
});

test('sin Stripe no hay cobro sin ella ni enlace de tarjeta, aunque la tarjeta siga guardada', () => {
  const m = listo({ ...base, estudioConStripe: false, clienta: VISA });
  assert.equal(m.online, null);
  assert.equal(m.pedirTarjeta, null);
  assert.deepEqual(m.lineas, ['Visa ··0077 · caduca 05/2027']);
});

test('sin cliente de Stripe no hay cobro sin ella (`cobrarReciboOffSession` lo exige)', () => {
  assert.equal(listo({ ...base, clienta: { ...VISA, stripeCustomerId: null } }).online, null);
});

test('Link no tiene caducidad: no se afirma que caduque', () => {
  const m = listo({ ...base, clienta: { stripeCustomerId: 'cus_1', stripePaymentMethodId: 'pm_link', tarjetaMarca: 'link' } });
  assert.deepEqual(m.online, { metodo: 'TARJETA', boton: 'Cobrar con su tarjeta (Link)' });
  assert.deepEqual(m.lineas, ['Link (pago guardado en Stripe)']);
});

test('tarjeta sin caducidad guardada: se dice, sin inventarla', () => {
  assert.deepEqual(listo({ ...base, clienta: { ...VISA, tarjetaExpMes: null, tarjetaExpAnio: null } }).lineas, ['Visa ··0077 (sin fecha de caducidad guardada)']);
});

test('domiciliación de Stripe preferida: el cobro sin ella va por ahí', () => {
  const m = listo({ ...base, clienta: { ...VISA, metodoPagoPreferido: 'SEPA', sepaPaymentMethodId: 'pm_sepa' } });
  assert.deepEqual(m.online, { metodo: 'SEPA', boton: 'Cobrar por su domiciliación' });
  assert.ok(m.lineas.includes('Domiciliación con Stripe'));
});

test('domiciliada por remesa sin tarjeta: entra en la remesa y no se le insiste con la tarjeta', () => {
  const m = listo({ ...base, estudioHaceRemesas: true, tieneMandatoVigente: true, clienta: {} });
  assert.equal(m.domiciliacionRemesa, true);
  assert.equal(m.pedirTarjeta, null);
  assert.deepEqual(m.lineas, ['Domiciliación (mandato firmado)']);
  // Mandato sin remesas en el estudio: no cuenta.
  assert.equal(listo({ ...base, estudioHaceRemesas: false, tieneMandatoVigente: true, clienta: {} }).domiciliacionRemesa, false);
});

test('nada guardado: se le puede pedir la tarjeta', () => {
  const m = listo({ ...base, clienta: {} });
  assert.deepEqual(m.lineas, ['Sin tarjeta ni domiciliación']);
  assert.equal(m.pedirTarjeta, 'PEDIR');
  assert.equal(m.online, null);
});

test('sin poder leer sus datos, o sin los mandatos aún, no se afirma nada', () => {
  assert.deepEqual(comoSeLePuedeCobrar({ ...base, clienta: null }), { estado: 'SIN_LEER' });
  assert.deepEqual(comoSeLePuedeCobrar({ ...base, mandatosCargados: false, clienta: VISA }), { estado: 'COMPROBANDO' });
});
