import { test } from 'node:test';
import assert from 'node:assert/strict';
import { puedeArmarReintento, puedeIntentarCobro, type ReciboParaCobrar } from './cobro-permitido.ts';

const PROGRAMADO = '2026-09-18T08:30:00Z';
const recibo = (r: Partial<ReciboParaCobrar> = {}): ReciboParaCobrar => ({
  estado: 'PENDIENTE', proximoReintento: PROGRAMADO, trasCancelarCuota: null, ...r,
});

test('automático: con la cuota activa o sin cuota (matrícula, penalización), cobra el pendiente programado', () => {
  assert.deepEqual(puedeIntentarCobro(recibo(), { estado: 'ACTIVA' }, 'AUTOMATICO'), { ok: true });
  assert.deepEqual(puedeIntentarCobro(recibo(), null, 'AUTOMATICO'), { ok: true });
});

test('automático: una cuota cancelada NO se cobra sola, salvo que al cancelar se eligiera seguir reintentando', () => {
  assert.deepEqual(puedeIntentarCobro(recibo(), { estado: 'CANCELADA' }, 'AUTOMATICO'), { ok: false, motivo: 'CUOTA_CANCELADA' });
  assert.deepEqual(puedeIntentarCobro(recibo(), { estado: 'EXPIRADA' }, 'AUTOMATICO'), { ok: false, motivo: 'CUOTA_CANCELADA' });
  assert.deepEqual(puedeIntentarCobro(recibo({ trasCancelarCuota: 'REINTENTAR' }), { estado: 'CANCELADA' }, 'AUTOMATICO'), { ok: true });
  assert.deepEqual(puedeIntentarCobro(recibo({ trasCancelarCuota: 'SIN_REINTENTOS' }), { estado: 'CANCELADA' }, 'AUTOMATICO'), { ok: false, motivo: 'SIN_REINTENTOS' });
});

test('automático: pausada, sin reintento programado o no pendiente, no', () => {
  assert.deepEqual(puedeIntentarCobro(recibo(), { estado: 'PAUSADA' }, 'AUTOMATICO'), { ok: false, motivo: 'CUOTA_PAUSADA' });
  assert.deepEqual(puedeIntentarCobro(recibo({ proximoReintento: null }), { estado: 'ACTIVA' }, 'AUTOMATICO'), { ok: false, motivo: 'SIN_REINTENTO_PROGRAMADO' });
  for (const estado of ['FALLIDO', 'COBRADO', 'DEVUELTO', 'EN_CURSO']) {
    assert.deepEqual(puedeIntentarCobro(recibo({ estado }), { estado: 'ACTIVA' }, 'AUTOMATICO'), { ok: false, motivo: 'NO_PENDIENTE' }, estado);
  }
});

test('anulado: no se cobra por ningún camino, ni a mano', () => {
  for (const via of ['AUTOMATICO', 'STAFF'] as const) {
    assert.deepEqual(puedeIntentarCobro(recibo({ estado: 'ANULADO' }), null, via), { ok: false, motivo: 'ANULADO' }, via);
    assert.deepEqual(puedeIntentarCobro(recibo({ trasCancelarCuota: 'ANULADO' }), { estado: 'CANCELADA' }, via), { ok: false, motivo: 'ANULADO' }, via);
  }
});

test('a mano (estudio): pendiente o fallido, también de una cuota cancelada; pausada no', () => {
  assert.deepEqual(puedeIntentarCobro(recibo({ proximoReintento: null }), { estado: 'CANCELADA' }, 'STAFF'), { ok: true });
  assert.deepEqual(puedeIntentarCobro(recibo({ estado: 'FALLIDO', trasCancelarCuota: 'SIN_REINTENTOS' }), { estado: 'CANCELADA' }, 'STAFF'), { ok: true });
  assert.deepEqual(puedeIntentarCobro(recibo(), { estado: 'PAUSADA' }, 'STAFF'), { ok: false, motivo: 'CUOTA_PAUSADA' });
  assert.deepEqual(puedeIntentarCobro(recibo({ estado: 'COBRADO' }), null, 'STAFF'), { ok: false, motivo: 'NO_PENDIENTE' });
});

test('armar reintentos: solo con la cuota activa y un recibo que nadie marcó al cancelar', () => {
  assert.equal(puedeArmarReintento(recibo({ proximoReintento: null }), { estado: 'ACTIVA' }), true);
  assert.equal(puedeArmarReintento(recibo({ proximoReintento: null }), { estado: 'CANCELADA' }), false);
  assert.equal(puedeArmarReintento(recibo({ proximoReintento: null, trasCancelarCuota: 'REINTENTAR' }), { estado: 'ACTIVA' }), false);
  assert.equal(puedeArmarReintento(recibo({ proximoReintento: null }), null), false);
});

// Revisión del 5-oct (#11/#12): una cuota nunca se cobra SOLA antes de vencer, tampoco
// un recibo adoptado antes de que la adopción mirara fechas, o con la cuota alargada.
test('automático: la renovación de una cuota sin vencer espera a su día; a mano, decide el estudio', () => {
  const rec: ReciboParaCobrar = { estado: 'PENDIENTE', proximoReintento: '2026-10-06T06:00:00Z', trasCancelarCuota: null, esRenovacion: true };
  const cuota = (fechaFin: string | null, tipoPlan = 'MENSUAL') => ({ estado: 'ACTIVA', tipoPlan, fechaFin });
  assert.deepEqual(puedeIntentarCobro(rec, cuota('2026-10-31'), 'AUTOMATICO', '2026-10-06'), { ok: false, motivo: 'CUOTA_SIN_VENCER' });
  assert.deepEqual(puedeIntentarCobro(rec, cuota('2026-10-06'), 'AUTOMATICO', '2026-10-06'), { ok: false, motivo: 'CUOTA_SIN_VENCER' }, 'el día que vence, aún no');
  assert.deepEqual(puedeIntentarCobro(rec, cuota(null), 'AUTOMATICO', '2026-10-06'), { ok: false, motivo: 'CUOTA_SIN_VENCER' }, 'sin fecha de fin, no se cobra sola');
  assert.deepEqual(puedeIntentarCobro(rec, cuota('2026-10-05'), 'AUTOMATICO', '2026-10-06'), { ok: true });
  // Un bono, una venta o un recibo sin la marca: como antes.
  assert.deepEqual(puedeIntentarCobro(rec, cuota('2026-12-31', 'BONO'), 'AUTOMATICO', '2026-10-06'), { ok: true });
  assert.deepEqual(puedeIntentarCobro({ ...rec, esRenovacion: false }, cuota('2026-12-31'), 'AUTOMATICO', '2026-10-06'), { ok: true });
  assert.deepEqual(puedeIntentarCobro({ ...rec, esRenovacion: undefined }, { estado: 'ACTIVA' }, 'AUTOMATICO', '2026-10-06'), { ok: true });
  // A mano («Cobrar online» del estudio) es una decisión de una persona: no se toca.
  assert.deepEqual(puedeIntentarCobro(rec, cuota('2026-10-31'), 'STAFF', '2026-10-06'), { ok: true });
});
