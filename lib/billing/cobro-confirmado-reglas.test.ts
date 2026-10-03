import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  conciliadoPorDe, efectosEnOrden, efectosEnReentrega, esRenovacion, estadosAdmitidosPorOrigen,
  facturaIdCheckout, facturaIdManual, facturaIdMetodoGuardado, facturaIdParaReintento, filtroCargoEnCas, origenNotifica,
  reentregaAplicaAlRecibo, refIdCreditoRenovacion, resolverSinFilas, ESPERA_A_UN_COBRO_OFF_SESSION, type OrigenCobro,
} from './cobro-confirmado-reglas.ts';
import { ESTADOS_COBRABLES } from './deuda-recibo.ts';

// Las reglas de «este recibo está cobrado», sin BD ni Stripe. Lo que fijan
// estos tests no se ve en ningún otro sitio: qué estados puede cerrar cada
// camino, qué significa que el compare-and-set no toque filas, qué avisos
// recibe el estudio y en qué orden salen los efectos.

const ORIGENES: OrigenCobro[] = ['webhook', 'conciliador', 'tpv', 'manual', 'off_session', 'banco'];

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

test('SEPA / tarjeta guardada (admitirDevuelto:false): solo PENDIENTE, FALLIDO y EN_CURSO', () => {
  for (const origen of ['webhook', 'conciliador'] as const) {
    assert.deepEqual(estadosAdmitidosPorOrigen(origen, { admitirDevuelto: false }), ['PENDIENTE', 'FALLIDO', 'EN_CURSO']);
  }
});

test('tarjeta guardada síncrona: solo lo que comprobó antes de cobrar', () => {
  assert.deepEqual(estadosAdmitidosPorOrigen('off_session'), ['PENDIENTE', 'FALLIDO']);
});

test('«El banco lo ha cobrado» solo cierra lo que está en el banco, y lo firma una persona', () => {
  assert.deepEqual(estadosAdmitidosPorOrigen('banco'), ['EN_CURSO']);
  assert.equal(conciliadoPorDe('banco'), 'manual');
  assert.equal(origenNotifica('banco'), false);
  assert.deepEqual(efectosEnReentrega('banco'), [], 'no pasó por el cajón: nada que reparar en la caja');
  assert.equal(efectosEnOrden({ origen: 'banco', metodo: 'SEPA', avisarSocia: false, esRenovacion: true }).includes('caja'), false);
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

// ── Filtro por cargo ─────────────────────────────────────────────────────────

test('sin cargo no se añade filtro', () => {
  assert.equal(filtroCargoEnCas(null), null);
});

test('con cargo: DEVUELTO solo con otro cargo, EN_CURSO solo con el mismo', () => {
  assert.equal(
    filtroCargoEnCas('pi_3Abc123'),
    'estado.not.in.(DEVUELTO,EN_CURSO),'
      + 'and(estado.eq.DEVUELTO,or(stripe_payment_intent_id.is.null,stripe_payment_intent_id.neq.pi_3Abc123)),'
      + 'and(estado.eq.EN_CURSO,or(stripe_payment_intent_id.is.null,stripe_payment_intent_id.eq.pi_3Abc123))',
  );
});

test('un id con caracteres raros no se interpola: fuera DEVUELTO y EN_CURSO enteros', () => {
  assert.equal(filtroCargoEnCas('pi_1,estado.eq.COBRADO'), 'estado.not.in.(DEVUELTO,EN_CURSO)');
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

test('EN_CURSO con OTRO cargo en vuelo: otro cobro', () => {
  assert.deepEqual(
    resolverSinFilas({ estado: 'EN_CURSO', stripe_payment_intent_id: 'pi_en_vuelo' }, 'pi_2'),
    { tipo: 'otro_cobro', anterior: 'pi_en_vuelo' },
  );
});

test('a mano (sin cargo) sobre un recibo que se está cobrando con su tarjeta guardada: cobro en marcha', () => {
  const marcado = { stripe_payment_intent_id: null, cobro_off_session_clave: 'offsession-cobro-rec-1-i0' };
  assert.deepEqual(resolverSinFilas({ estado: 'PENDIENTE', ...marcado }, null), { tipo: 'cobro_en_marcha', estado: 'PENDIENTE' });
  assert.deepEqual(resolverSinFilas({ estado: 'FALLIDO', ...marcado }, null), { tipo: 'cobro_en_marcha', estado: 'FALLIDO' });
  // Sin marca, lo de siempre.
  assert.deepEqual(resolverSinFilas({ estado: 'PENDIENTE', stripe_payment_intent_id: null }, null), { tipo: 'no_cobrable', estado: 'PENDIENTE' });
  // Con un cargo que llega, la marca no es el motivo: lo que confirma Stripe no la espera.
  assert.deepEqual(resolverSinFilas({ estado: 'PENDIENTE', ...marcado }, 'pi_2'), { tipo: 'no_cobrable', estado: 'PENDIENTE' });
});

test('quién espera a un cobro con tarjeta guardada en marcha: lo que confirma una persona, nunca lo que confirma Stripe', () => {
  assert.deepEqual(ESPERA_A_UN_COBRO_OFF_SESSION, {
    manual: true, banco: true, webhook: false, conciliador: false, tpv: false, off_session: false,
  } satisfies Record<OrigenCobro, boolean>);
});

test('DEVUELTO con el mismo cargo: no se resucita', () => {
  assert.deepEqual(resolverSinFilas({ estado: 'DEVUELTO', stripe_payment_intent_id: 'pi_1' }, 'pi_1'), { tipo: 'devuelto' });
});

test('DEVUELTO con otro cargo, o sin cargo guardado, y 0 filas: no cobrable', () => {
  assert.deepEqual(
    resolverSinFilas({ estado: 'DEVUELTO', stripe_payment_intent_id: 'pi_1' }, 'pi_2'),
    { tipo: 'no_cobrable', estado: 'DEVUELTO' },
  );
  assert.deepEqual(
    resolverSinFilas({ estado: 'DEVUELTO', stripe_payment_intent_id: null }, 'pi_2'),
    { tipo: 'no_cobrable', estado: 'DEVUELTO' },
  );
});

test('EN_CURSO sin cargo entrante y 0 filas (p. ej. a mano): no cobrable', () => {
  assert.deepEqual(
    resolverSinFilas({ estado: 'EN_CURSO', stripe_payment_intent_id: 'pi_1' }, null),
    { tipo: 'no_cobrable', estado: 'EN_CURSO' },
  );
});

// ── Avisos al estudio ────────────────────────────────────────────────────────

test('qué caminos avisan al estudio de que ha entrado dinero (no cambia con el refactor)', () => {
  // Checkout (webhook y conciliador) y TPV sí; el cobro automático con tarjeta
  // guardada no lo ha hecho nunca; el panel a mano tampoco lo emitía.
  const esperado: Record<OrigenCobro, boolean> = {
    // «El banco lo ha cobrado» lo marca una persona del estudio: como a mano, sin aviso.
    webhook: true, conciliador: true, tpv: true, manual: false, off_session: false, banco: false,
  };
  for (const o of ORIGENES) {
    assert.equal(origenNotifica(o), esperado[o], o);
    const pasos = efectosEnOrden({ origen: o, metodo: 'TARJETA', avisarSocia: false, esRenovacion: false });
    assert.equal(pasos.includes('notificacion'), esperado[o], `${o}: efectosEnOrden tiene que seguir la misma regla`);
  }
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

test('reentrega: solo se repite el apunte de caja del mostrador', () => {
  for (const o of ORIGENES) {
    assert.deepEqual(efectosEnReentrega(o), o === 'manual' || o === 'tpv' ? ['caja'] : [], o);
  }
});

test('reentrega a mano: solo repara un apunte de caja de un cobro que cerró un «marcar cobrado»', () => {
  assert.equal(reentregaAplicaAlRecibo('manual', 'manual'), true);
  // Ya cobrado por otro camino (la socia lo pagó online): el cajón no lo vio.
  for (const otro of ['webhook', 'conciliador', 'tpv', null, undefined]) {
    assert.equal(reentregaAplicaAlRecibo('manual', otro), false, String(otro));
  }
});

test('reentrega del TPV: no depende de quién cerró el recibo (el primero en llegar puede ser el webhook)', () => {
  for (const cerro of ['webhook', 'conciliador', 'tpv', 'manual', null]) {
    assert.equal(reentregaAplicaAlRecibo('tpv', cerro), true, String(cerro));
  }
  for (const o of ORIGENES.filter(o => o !== 'manual' && o !== 'tpv')) {
    assert.equal(reentregaAplicaAlRecibo(o, 'manual'), false, o);
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
  assert.equal(facturaIdManual('rec-1'), 'fac-manual-rec-1');
});

test('el reintento de un cobro a mano sella con el id del panel, aunque el recibo diga SEPA', () => {
  assert.equal(facturaIdParaReintento({ id: 'rec-1', metodo_cobro: 'EFECTIVO', conciliado_por: 'manual' }), 'fac-manual-rec-1');
  assert.equal(facturaIdParaReintento({ id: 'rec-1', metodo_cobro: 'SEPA', conciliado_por: 'manual' }), 'fac-manual-rec-1');
  // El sellado valida el id con /^[A-Za-z0-9_-]{1,64}$/: el prefijo no puede
  // dejar fuera un recibo que ya cabía con `fac-checkout-`.
  assert.ok(facturaIdManual('x').length <= facturaIdCheckout('x').length);
});

test('el reintento de sellado ya no fuerza fac-checkout- para todo', () => {
  assert.equal(facturaIdParaReintento({ id: 'rec-pos-v1', metodo_cobro: 'EFECTIVO', conciliado_por: null }), 'fac-pos-v1');
  assert.equal(facturaIdParaReintento({ id: 'rec-9', metodo_cobro: 'SEPA', conciliado_por: 'webhook' }), 'fac-sepa-rec-9');
  assert.equal(facturaIdParaReintento({ id: 'rec-9', metodo_cobro: 'TARJETA', conciliado_por: null }), 'fac-off-rec-9');
  assert.equal(facturaIdParaReintento({ id: 'rec-web-abc', metodo_cobro: 'BIZUM', conciliado_por: 'webhook' }), 'fac-checkout-rec-web-abc');
});

test('«Hacerle factura»: el efectivo saca factura solo si se pide, y el resto sigue igual', () => {
  const sin = efectosEnOrden({ origen: 'manual', metodo: 'EFECTIVO', avisarSocia: false, esRenovacion: false });
  assert.equal(sin.includes('factura'), false);
  const con = efectosEnOrden({ origen: 'manual', metodo: 'EFECTIVO', avisarSocia: false, esRenovacion: false, conFactura: true });
  assert.deepEqual(con, ['renovacion', 'factura', 'caja']);
  // Con tarjeta ya salía: pedirla no la duplica.
  const tarjeta = efectosEnOrden({ origen: 'manual', metodo: 'TARJETA', avisarSocia: false, esRenovacion: false, conFactura: true });
  assert.equal(tarjeta.filter(p => p === 'factura').length, 1);
});
