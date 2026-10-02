import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accionesDeDevolucion, elBancoPuedeDevolver, type ReciboParaDevolver } from './devolucion-reglas.ts';

// Qué botón de devolución toca a cada recibo. «Le he devuelto el dinero» (ya no
// debe) y «El banco lo devolvió» (vuelve a deber) son hechos opuestos.

const cobro = (p: Partial<ReciboParaDevolver> = {}): ReciboParaDevolver => ({ estado: 'COBRADO', importe: 40, importeDevuelto: 0, ...p });

test('un cobro en efectivo, Bizum o transferencia: solo «Le he devuelto el dinero» (ningún banco lo devuelve)', () => {
  for (const metodoCobro of ['EFECTIVO', 'BIZUM', 'TRANSFERENCIA']) {
    assert.deepEqual(accionesDeDevolucion(cobro({ metodoCobro })),
      { reembolsoAMano: true, bancoLoDevolvio: false, bancoLoCobro: false, loCierraStripe: false }, metodoCobro);
  }
});

test('con tarjeta del datáfono o sin método: las dos, que son cosas distintas', () => {
  for (const metodoCobro of ['TARJETA', null]) {
    const a = accionesDeDevolucion(cobro({ metodoCobro }));
    assert.equal(a.reembolsoAMano, true, String(metodoCobro));
    assert.equal(a.bancoLoDevolvio, true, String(metodoCobro));
  }
});

test('lo que entró por Stripe no tiene ninguno de los dos: se devuelve por Stripe', () => {
  const a = accionesDeDevolucion(cobro({ metodoCobro: 'TARJETA', stripePaymentIntentId: 'pi_1' }));
  assert.equal(a.reembolsoAMano || a.bancoLoDevolvio, false);
  // Un adeudo que falló y se pagó luego en efectivo no entró por Stripe.
  assert.equal(accionesDeDevolucion(cobro({ metodoCobro: 'EFECTIVO', stripePaymentIntentId: 'pi_1' })).reembolsoAMano, true);
});

test('un cobro con algo ya devuelto, o con un reembolso pedido, no ofrece nada más', () => {
  for (const p of [{ importeDevuelto: 10 }, { reembolsoSolicitadoEn: '2026-10-01T10:00:00Z' }, { reembolsoStripeId: 're_1' }]) {
    const a = accionesDeDevolucion(cobro({ metodoCobro: 'EFECTIVO', ...p }));
    assert.equal(a.reembolsoAMano || a.bancoLoDevolvio, false, JSON.stringify(p));
  }
});

test('en el banco: si es una remesa, «lo ha cobrado» o «lo devolvió»; con un cargo de Stripe en vuelo, lo cierra Stripe', () => {
  assert.deepEqual(accionesDeDevolucion({ estado: 'EN_CURSO', importe: 40 }),
    { reembolsoAMano: false, bancoLoDevolvio: true, bancoLoCobro: true, loCierraStripe: false });
  assert.deepEqual(accionesDeDevolucion({ estado: 'EN_CURSO', importe: 40, stripePaymentIntentId: 'pi_1' }),
    { reembolsoAMano: false, bancoLoDevolvio: false, bancoLoCobro: false, loCierraStripe: true });
});

test('pendiente y fallido, como siempre: «El banco lo devolvió». Devuelto, anulado: nada', () => {
  for (const estado of ['PENDIENTE', 'FALLIDO']) assert.equal(accionesDeDevolucion({ estado, importe: 40 }).bancoLoDevolvio, true, estado);
  for (const estado of ['DEVUELTO', 'ANULADO']) {
    const a = accionesDeDevolucion({ estado, importe: 40 });
    assert.equal(a.reembolsoAMano || a.bancoLoDevolvio || a.bancoLoCobro, false, estado);
  }
});

test('qué devuelve un banco', () => {
  assert.equal(elBancoPuedeDevolver('TARJETA'), true);
  assert.equal(elBancoPuedeDevolver('SEPA'), true);
  assert.equal(elBancoPuedeDevolver(null), true, 'sin método no se sabe: se deja');
  for (const m of ['EFECTIVO', 'BIZUM', 'TRANSFERENCIA']) assert.equal(elBancoPuedeDevolver(m), false, m);
});

test('una venta de la caja (`rec-pos-…`) no tiene ningún botón aquí: se devuelve desde la caja', () => {
  assert.deepEqual(accionesDeDevolucion(cobro({ id: 'rec-pos-v-1', metodoCobro: 'EFECTIVO' })),
    { reembolsoAMano: false, bancoLoDevolvio: false, bancoLoCobro: false, loCierraStripe: false });
  assert.equal(accionesDeDevolucion(cobro({ id: 'rec-1', metodoCobro: 'EFECTIVO' })).reembolsoAMano, true, 'un cobro normal sí');
});

test('en el banco con un reintento automático programado: lo cierra Stripe, no el mostrador', () => {
  const r = accionesDeDevolucion({ estado: 'EN_CURSO', importe: 40, importeDevuelto: 0, proximoReintento: '2026-10-05' });
  assert.equal(r.loCierraStripe, true);
  assert.equal(r.bancoLoCobro || r.bancoLoDevolvio, false);
});
