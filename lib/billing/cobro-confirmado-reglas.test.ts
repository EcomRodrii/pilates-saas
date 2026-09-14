import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  conciliadoPorDe, efectosEnOrden, esRenovacion, estadosAdmitidosPorOrigen, facturaIdCheckout,
  facturaIdMetodoGuardado, facturaIdParaReintento, filtroNoResucitarDevuelto, refIdCreditoRenovacion,
  resolverSinFilas, type OrigenCobro,
} from './cobro-confirmado-reglas.ts';
import { ESTADOS_COBRABLES } from './deuda-recibo.ts';

// Las reglas de «este recibo está cobrado», sin BD ni Stripe. Lo que fijan
// estos tests no se ve en ningún otro sitio: qué estados puede cerrar cada
// camino, qué significa que el compare-and-set no toque filas, y en qué orden
// salen los efectos.

const ORIGENES: OrigenCobro[] = ['webhook', 'conciliador', 'tpv', 'manual', 'off_session'];

// ── Estados admitidos ────────────────────────────────────────────────────────

test('a mano nunca se cierra un EN_CURSO: hay un cargo en vuelo', () => {
  assert.equal(estadosAdmitidosPorOrigen('manual').includes('EN_CURSO'), false);
  assert.deepEqual(estadosAdmitidosPorOrigen('manual'), [...ESTADOS_COBRABLES]);
});

test('lo que confirma Stripe acepta todo lo cobrable y además EN_CURSO', () => {
  for (const origen of ['webhook', 'conciliador', 'tpv'] as const) {
    const admitidos = estadosAdmitidosPorOrigen(origen);
    for (const e of ESTADOS_COBRABLES) assert.ok(admitidos.includes(e), `${origen} debe admitir ${e}`);
    assert.ok(admitidos.includes('EN_CURSO'), `${origen} debe poder cerrar el adeudo en vuelo`);
  }
});

test('tarjeta guardada: solo lo que comprobó antes de cobrar', () => {
  assert.deepEqual(estadosAdmitidosPorOrigen('off_session'), ['PENDIENTE', 'FALLIDO']);
});

test('ningún camino reescribe un COBRADO', () => {
  for (const o of ORIGENES) assert.equal(estadosAdmitidosPorOrigen(o).includes('COBRADO'), false, o);
});

test('conciliado_por: off_session no escribe nada que el CHECK no admita', () => {
  assert.equal(conciliadoPorDe('off_session'), null);
  assert.equal(conciliadoPorDe('manual'), 'manual');
  assert.equal(conciliadoPorDe('tpv'), 'tpv');
  assert.equal(conciliadoPorDe('webhook'), 'webhook');
  assert.equal(conciliadoPorDe('conciliador'), 'conciliador');
});

// ── No resucitar un devuelto ─────────────────────────────────────────────────

test('sin cargo no se añade filtro', () => {
  assert.equal(filtroNoResucitarDevuelto(null), null);
});

test('con cargo: un DEVUELTO con ESE cargo queda fuera; con otro, dentro', () => {
  assert.equal(
    filtroNoResucitarDevuelto('pi_3Abc123'),
    'estado.neq.DEVUELTO,stripe_payment_intent_id.is.null,stripe_payment_intent_id.neq.pi_3Abc123',
  );
});

test('un id con caracteres raros no se interpola: se excluye DEVUELTO entero', () => {
  assert.equal(filtroNoResucitarDevuelto('pi_1,estado.eq.COBRADO'), 'estado.neq.DEVUELTO');
});

// ── 0 filas ──────────────────────────────────────────────────────────────────

test('0 filas y no existe (o es de otro estudio): no encontrado', () => {
  assert.deepEqual(resolverSinFilas(null, 'pi_1'), { tipo: 'no_encontrado' });
});

test('0 filas y ya COBRADO con el mismo cargo: reentrega', () => {
  assert.deepEqual(resolverSinFilas({ estado: 'COBRADO', stripe_payment_intent_id: 'pi_1' }, 'pi_1'), { tipo: 'ya_estaba' });
});

test('0 filas y ya COBRADO, sin cargo con el que comparar: reentrega', () => {
  assert.deepEqual(resolverSinFilas({ estado: 'COBRADO', stripe_payment_intent_id: 'pi_1' }, null), { tipo: 'ya_estaba' });
});

test('0 filas y COBRADO con OTRO cargo: dinero cobrado dos veces, nunca un éxito', () => {
  assert.deepEqual(
    resolverSinFilas({ estado: 'COBRADO', stripe_payment_intent_id: 'pi_1' }, 'pi_2'),
    { tipo: 'otro_cobro', anterior: 'pi_1' },
  );
});

test('0 filas y COBRADO sin cargo guardado al que le llega uno: también otro cobro', () => {
  // Lo marcaron cobrado sin Stripe (efectivo en mostrador) y además entró un cargo.
  assert.deepEqual(
    resolverSinFilas({ estado: 'COBRADO', stripe_payment_intent_id: null }, 'pi_2'),
    { tipo: 'otro_cobro', anterior: null },
  );
});

test('DEVUELTO con el mismo cargo: no se resucita', () => {
  assert.deepEqual(resolverSinFilas({ estado: 'DEVUELTO', stripe_payment_intent_id: 'pi_1' }, 'pi_1'), { tipo: 'devuelto' });
});

test('DEVUELTO con otro cargo y 0 filas: hay un reembolso en curso, no se admite', () => {
  assert.deepEqual(
    resolverSinFilas({ estado: 'DEVUELTO', stripe_payment_intent_id: 'pi_1' }, 'pi_2'),
    { tipo: 'no_cobrable', estado: 'DEVUELTO' },
  );
});

test('EN_CURSO y 0 filas (p. ej. a mano): no cobrable', () => {
  assert.deepEqual(
    resolverSinFilas({ estado: 'EN_CURSO', stripe_payment_intent_id: 'pi_1' }, null),
    { tipo: 'no_cobrable', estado: 'EN_CURSO' },
  );
});

// ── Efectos ──────────────────────────────────────────────────────────────────

test('orden: renovación → factura → notificación → email', () => {
  assert.deepEqual(
    efectosEnOrden({ origen: 'webhook', metodo: 'TARJETA', avisarSocia: true, esRenovacion: false }),
    ['renovacion', 'factura', 'notificacion', 'email'],
  );
});

test('la factura siempre va antes del email, para que el justificante lleve su número', () => {
  for (const o of ORIGENES) {
    const pasos = efectosEnOrden({ origen: o, metodo: 'SEPA', avisarSocia: true, esRenovacion: true });
    assert.ok(pasos.indexOf('factura') < pasos.indexOf('email'), o);
    assert.ok(pasos.indexOf('renovacion') < pasos.indexOf('factura'), o);
    assert.equal(pasos.at(-1), 'email', o);
  }
});

test('el efectivo no emite factura sola', () => {
  assert.equal(efectosEnOrden({ origen: 'manual', metodo: 'EFECTIVO', avisarSocia: false, esRenovacion: false }).includes('factura'), false);
});

test('la caja solo cuenta lo que pasa por el mostrador', () => {
  for (const o of ORIGENES) {
    const tieneCaja = efectosEnOrden({ origen: o, metodo: 'TARJETA', avisarSocia: false, esRenovacion: false }).includes('caja');
    assert.equal(tieneCaja, o === 'manual' || o === 'tpv', o);
  }
});

test('créditos solo para una renovación', () => {
  assert.ok(efectosEnOrden({ origen: 'off_session', metodo: 'TARJETA', avisarSocia: false, esRenovacion: true }).includes('creditos'));
  assert.equal(efectosEnOrden({ origen: 'off_session', metodo: 'TARJETA', avisarSocia: false, esRenovacion: false }).includes('creditos'), false);
});

test('sin avisarSocia no hay email', () => {
  assert.equal(efectosEnOrden({ origen: 'webhook', metodo: 'TARJETA', avisarSocia: false, esRenovacion: false }).includes('email'), false);
});

test('renovar/notificar se pueden apagar (la compra web ya entregó)', () => {
  assert.deepEqual(
    efectosEnOrden({ origen: 'webhook', metodo: 'TARJETA', avisarSocia: false, esRenovacion: false, renovar: false, notificar: false }),
    ['factura'],
  );
});

// ── Renovación y créditos ────────────────────────────────────────────────────

test('renovación es la marca del recibo, no el texto del concepto', () => {
  assert.equal(esRenovacion({ es_renovacion: true }), true);
  assert.equal(esRenovacion({ es_renovacion: false }), false);
  assert.equal(esRenovacion({ es_renovacion: null }), false);
  assert.equal(esRenovacion(null), false);
  // Un concepto «Renovación …» sin la marca no cuenta.
  assert.equal(esRenovacion({ es_renovacion: null, concepto: 'Renovación Bono 10' } as { es_renovacion: null }), false);
});

test('el ref_id de los créditos de renovación es el id del recibo (la RPC lo exige)', () => {
  assert.equal(refIdCreditoRenovacion('rec-renov-sus-1-2026-09'), 'rec-renov-sus-1-2026-09');
});

// ── Id de factura por canal ──────────────────────────────────────────────────

test('cada canal sella con su propio id', () => {
  assert.equal(facturaIdCheckout('rec-1'), 'fac-checkout-rec-1');
  assert.equal(facturaIdMetodoGuardado('rec-1', 'SEPA'), 'fac-sepa-rec-1');
  assert.equal(facturaIdMetodoGuardado('rec-1', 'TARJETA'), 'fac-off-rec-1');
});

test('el reintento de sellado ya no fuerza fac-checkout- para todo', () => {
  assert.equal(facturaIdParaReintento({ id: 'rec-pos-v1', metodo_cobro: 'EFECTIVO', conciliado_por: null }), 'fac-pos-v1');
  assert.equal(facturaIdParaReintento({ id: 'rec-9', metodo_cobro: 'SEPA', conciliado_por: 'webhook' }), 'fac-sepa-rec-9');
  assert.equal(facturaIdParaReintento({ id: 'rec-9', metodo_cobro: 'TARJETA', conciliado_por: null }), 'fac-off-rec-9');
  assert.equal(facturaIdParaReintento({ id: 'rec-web-abc', metodo_cobro: 'BIZUM', conciliado_por: 'webhook' }), 'fac-checkout-rec-web-abc');
});
