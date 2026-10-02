import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emparejar, emparejarLote, cobradoPorStripe,
  type ContextoEmparejar, type ReciboParaEmparejar, type SociaParaEmparejar,
} from './emparejar.ts';
import type { MovimientoNormalizado } from './tipos.ts';

// Alumnas, recibos y movimientos INVENTADOS.

const MARIA: SociaParaEmparejar = { id: 'soc-maria', nombre: 'María', apellidos: 'García López' };
const LAURA: SociaParaEmparejar = { id: 'soc-laura', nombre: 'Laura', apellidos: 'Pérez Ruiz' };

function recibo(p: Partial<ReciboParaEmparejar> & { id: string }): ReciboParaEmparejar {
  return {
    socioId: MARIA.id, importeCentimos: 5900, estado: 'PENDIENTE', fechaVencimiento: '2026-10-01', fechaCobro: null,
    metodoCobro: null, conciliadoPor: null, stripePaymentIntentId: null, cobroMostradorPi: null,
    importeDevueltoCentimos: 0, conReembolso: false, concepto: 'Cuota mensual octubre', ligadoAMovimiento: false,
    ...p,
  };
}

function mov(p: Partial<MovimientoNormalizado> = {}): MovimientoNormalizado {
  return {
    fuente: 'norma43', claveIdempotencia: 'k', idExterno: null, tipo: 'COBRO', metodo: 'TRANSFERENCIA',
    importeCentimos: 5900, fechaOperacion: '2026-10-01', horaOperacion: null, fechaValor: null, referencia: null,
    tarjetaUltimos4: null, tarjetaMarca: null, terminalRef: null, pagadorNombre: null, concepto: null,
    ...p,
  };
}

function ctx(recibos: ReciboParaEmparejar[], extra: Partial<ContextoEmparejar> = {}): ContextoEmparejar {
  return {
    recibos, socias: new Map([[MARIA.id, MARIA], [LAURA.id, LAURA]]),
    asistencias: [], historial: [], bloqueados: new Set(), ...extra,
  };
}

test('importe distinto (59,00 € frente a 59,01 €) → ninguna candidata, nunca', () => {
  const d = emparejar(mov({ importeCentimos: 5901, pagadorNombre: 'maria garcia lopez' }), ctx([recibo({ id: 'rec-1' })]));
  assert.equal(d.nivel, 'NINGUNA');
  assert.deepEqual(d.candidatas, []);
});

test('una única candidata, con el pagador y la cuota → UNICA_CLARA, con sus razones', () => {
  const d = emparejar(mov({ pagadorNombre: 'maria garcia lopez', concepto: 'TRANSFERENCIA CUOTA OCTUBRE' }), ctx([recibo({ id: 'rec-1' })]));
  assert.equal(d.nivel, 'UNICA_CLARA');
  assert.equal(d.candidatas[0].reciboId, 'rec-1');
  assert.equal(d.candidatas[0].accion, 'COBRAR');
  const codigos = d.candidatas[0].razones.map(r => r.codigo);
  assert.ok(codigos.includes('PAGADOR_COMPLETO'));
  assert.ok(codigos.includes('VENCE_CERCA'));
  assert.ok(codigos.includes('UNICO_DE_ESE_IMPORTE'));
  assert.ok(d.candidatas[0].puntuacion >= 80);
  // Lo que se guarda no lleva nombres: códigos y datos sin personas.
  assert.equal(JSON.stringify(d).includes('García'), false);
});

test('dos alumnas con el mismo importe y nada que las distinga → DUDOSA, nunca clara', () => {
  const d = emparejar(mov(), ctx([recibo({ id: 'rec-m' }), recibo({ id: 'rec-l', socioId: LAURA.id })]));
  assert.equal(d.nivel, 'DUDOSA');
  assert.equal(d.candidatas.length, 2);
});

test('varias candidatas: ordenadas por puntuación, con empate estable', () => {
  const c = ctx([recibo({ id: 'rec-b', socioId: LAURA.id }), recibo({ id: 'rec-a' })]);
  const d1 = emparejar(mov(), c);
  const d2 = emparejar(mov(), c);
  assert.deepEqual(d1.candidatas.map(x => x.reciboId), d2.candidatas.map(x => x.reciboId));
  assert.deepEqual(d1.candidatas.map(x => x.reciboId), ['rec-a', 'rec-b'], 'empate → por id');
});

test('pago sin candidata → NINGUNA', () => {
  assert.equal(emparejar(mov({ importeCentimos: 12345 }), ctx([recibo({ id: 'rec-1' })])).nivel, 'NINGUNA');
});

test('la referencia de Tentare decide, aunque haya otros recibos del mismo importe', () => {
  const d = emparejar(mov({ referencia: 'rec-l' }), ctx([recibo({ id: 'rec-m' }), recibo({ id: 'rec-l', socioId: LAURA.id })]));
  assert.equal(d.nivel, 'REFERENCIA');
  assert.equal(d.candidatas[0].reciboId, 'rec-l');
});

test('un LIQUIDACION o un NO_ALUMNA nunca se empareja', () => {
  for (const tipo of ['LIQUIDACION', 'NO_ALUMNA'] as const) {
    assert.equal(emparejar(mov({ tipo }), ctx([recibo({ id: 'rec-1' })])).nivel, 'NINGUNA');
  }
});

test('no son candidatas: EN_CURSO, con cobro en el datáfono, una cita, una penalización anulada, con reembolso', () => {
  const c = ctx([
    recibo({ id: 'rec-curso', estado: 'EN_CURSO' }),
    recibo({ id: 'rec-mostrador', cobroMostradorPi: 'pi_x' }),
    recibo({ id: 'rec-cita-1' }),
    recibo({ id: 'rec-penaliz-1' }),
    recibo({ id: 'rec-reemb', conReembolso: true }),
    recibo({ id: 'rec-ligado', ligadoAMovimiento: true }),
  ], { bloqueados: new Set(['rec-penaliz-1']) });
  assert.deepEqual(emparejar(mov(), c).candidatas, []);
});

test('el DEVUELTO del banco sí es candidata; el reembolsado por el estudio, no', () => {
  const d = emparejar(mov(), ctx([
    recibo({ id: 'rec-banco', estado: 'DEVUELTO', importeDevueltoCentimos: 0 }),
    recibo({ id: 'rec-reemb', estado: 'DEVUELTO', importeDevueltoCentimos: 5900, socioId: LAURA.id }),
  ]));
  assert.deepEqual(d.candidatas.map(c => c.reciboId), ['rec-banco']);
});

test('fuera de la ventana de fechas no es candidata', () => {
  assert.equal(emparejar(mov(), ctx([recibo({ id: 'rec-viejo', fechaVencimiento: '2026-07-01' })])).nivel, 'NINGUNA');
});

test('cobro apuntado a mano ese día (sin Stripe) → se propone ENLAZAR, no cobrar otra vez', () => {
  const apuntado = recibo({ id: 'rec-apuntado', estado: 'COBRADO', fechaCobro: '2026-10-01', metodoCobro: 'TRANSFERENCIA', conciliadoPor: 'manual' });
  const d = emparejar(mov({ pagadorNombre: 'maria garcia lopez' }), ctx([apuntado]));
  assert.equal(d.candidatas[0].accion, 'ENLAZAR');
  assert.equal(d.candidatas[0].reciboId, 'rec-apuntado');
  assert.deepEqual(d.dobleCobro, []);
});

test('ENLAZAR exige el mismo tipo de método: una tarjeta no enlaza con un cobro en efectivo', () => {
  const efectivo = recibo({ id: 'rec-ef', estado: 'COBRADO', fechaCobro: '2026-10-01', metodoCobro: 'EFECTIVO', conciliadoPor: 'manual' });
  assert.deepEqual(emparejar(mov({ metodo: 'TARJETA' }), ctx([efectivo])).candidatas, []);
});

test('recibo ya cobrado POR STRIPE que se parece a este pago → nunca enlazar; aviso de doble cobro', () => {
  const porStripe = recibo({ id: 'rec-stripe', estado: 'COBRADO', fechaCobro: '2026-10-02', metodoCobro: 'TARJETA', conciliadoPor: 'webhook', stripePaymentIntentId: 'pi_1' });
  assert.equal(cobradoPorStripe(porStripe), true);
  const d = emparejar(mov({ pagadorNombre: 'maria garcia lopez' }), ctx([porStripe]));
  assert.deepEqual(d.candidatas, [], 'no se ofrece para enlazar');
  assert.deepEqual(d.dobleCobro, ['rec-stripe']);
});

test('un SEPA rechazado que luego se pagó por transferencia y se apuntó a mano SÍ se enlaza: no es Stripe', () => {
  const apuntado = recibo({
    id: 'rec-sepa', estado: 'COBRADO', fechaCobro: '2026-10-01', metodoCobro: 'TRANSFERENCIA', conciliadoPor: 'manual',
    stripePaymentIntentId: 'pi_sepa_fallido', sepaEstado: 'failed',
  });
  assert.equal(cobradoPorStripe(apuntado), false);
  const d = emparejar(mov({ pagadorNombre: 'maria garcia lopez' }), ctx([apuntado]));
  assert.equal(d.candidatas[0]?.accion, 'ENLAZAR');
  assert.deepEqual(d.dobleCobro, []);
});

test('un abono OTRO enlaza con una transferencia apuntada a mano, como al confirmar', () => {
  const apuntado = recibo({ id: 'rec-t', estado: 'COBRADO', fechaCobro: '2026-10-01', metodoCobro: 'TRANSFERENCIA', conciliadoPor: 'manual' });
  assert.equal(emparejar(mov({ metodo: 'OTRO' }), ctx([apuntado])).candidatas[0]?.accion, 'ENLAZAR');
});

test('un recibo cobrado por Stripe del mismo importe pero sin nada que lo ate a este pago no da falsas alarmas', () => {
  const porStripe = recibo({ id: 'rec-stripe', socioId: LAURA.id, estado: 'COBRADO', fechaCobro: '2026-10-02', conciliadoPor: 'webhook', stripePaymentIntentId: 'pi_1' });
  assert.deepEqual(emparejar(mov(), ctx([porStripe])).dobleCobro, []);
});

test('tarjeta ···1234 que ya pagó esta alumna y vino a la clase de las 18:30', () => {
  const d = emparejar(
    mov({ metodo: 'TARJETA', tarjetaUltimos4: '1234', tarjetaMarca: 'visa', horaOperacion: '18:32' }),
    ctx([recibo({ id: 'rec-m' }), recibo({ id: 'rec-l', socioId: LAURA.id })], {
      historial: [{ socioId: MARIA.id, fecha: '2026-09-01', importeCentimos: 5900, metodo: 'TARJETA', tarjetaUltimos4: '1234', tarjetaMarca: 'visa' }],
      asistencias: [{ socioId: MARIA.id, fecha: '2026-10-01', inicio: '18:30', fin: '19:25', checkIn: true }],
    }),
  );
  assert.equal(d.candidatas[0].reciboId, 'rec-m');
  const codigos = d.candidatas[0].razones.map(r => r.codigo);
  assert.ok(codigos.includes('TARJETA_CONOCIDA'));
  assert.ok(codigos.includes('VINO_A_CLASE'));
  assert.ok(codigos.includes('PAGO_HABITUAL'));
  assert.equal(d.nivel, 'UNICA_CLARA');
});

test('LOTE: dos Bizum idénticos que apuntan al mismo recibo → ninguno es claro', () => {
  const m = mov({ metodo: 'BIZUM', pagadorNombre: 'maria garcia lopez', concepto: 'BIZUM CUOTA OCTUBRE' });
  const c = ctx([recibo({ id: 'rec-1' })]);
  assert.equal(emparejar(m, c).nivel, 'UNICA_CLARA', 'por separado, cada uno parecería claro');
  const [a, b] = emparejarLote([{ ...m, claveIdempotencia: 'k#1' }, { ...m, claveIdempotencia: 'k#2' }], c);
  assert.equal(a.nivel, 'DUDOSA');
  assert.equal(b.nivel, 'DUDOSA');
});
