import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esRenovacionSinCobroAutomatico, renovacionPorPagar, type FilaReciboRenovacion } from './renovacion-sin-tarjeta.ts';

const recibo = (cambios: Partial<FilaReciboRenovacion> = {}): FilaReciboRenovacion => ({
  id: 'rec-renov-sus-1-2026-09', estado: 'PENDIENTE', es_renovacion: true, proximo_reintento: null,
  concepto: 'Renovación Mensual ilimitado', importe: 60, fecha_vencimiento: '2026-09-01', ...cambios,
});

test('una renovación pendiente sin reintento programado no se va a cobrar sola', () => {
  assert.equal(esRenovacionSinCobroAutomatico(recibo()), true);
});

test('con reintento programado la cobra el dunning: no se ofrece pagarla a mano (sería cobrarla dos veces)', () => {
  assert.equal(esRenovacionSinCobroAutomatico(recibo({ proximo_reintento: '2026-09-02T08:30:00Z' })), false);
});

test('solo renovaciones pendientes: ni una venta suelta, ni una ya cobrada, fallida o anulada', () => {
  assert.equal(esRenovacionSinCobroAutomatico(recibo({ es_renovacion: false })), false);
  assert.equal(esRenovacionSinCobroAutomatico(recibo({ es_renovacion: null })), false);
  for (const estado of ['COBRADO', 'FALLIDO', 'ANULADO', 'EN_CURSO']) {
    assert.equal(esRenovacionSinCobroAutomatico(recibo({ estado })), false, estado);
  }
});

test('la renovación por pagar es la más antigua, con lo que se le enseña', () => {
  const r = renovacionPorPagar([
    recibo({ id: 'b', fecha_vencimiento: '2026-09-01' }),
    recibo({ id: 'a', fecha_vencimiento: '2026-08-01T00:00:00+00:00' }),
    recibo({ id: 'c', estado: 'COBRADO', fecha_vencimiento: '2026-07-01' }),
  ], true);
  assert.deepEqual(r, { reciboId: 'a', concepto: 'Renovación Mensual ilimitado', importe: 60, vence: '2026-08-01', pagableOnline: true });
});

test('sin ninguna, null; y si el estudio no cobra online, se dice (se paga en el estudio)', () => {
  assert.equal(renovacionPorPagar([recibo({ proximo_reintento: '2026-09-02T08:30:00Z' })], true), null);
  assert.equal(renovacionPorPagar([], true), null);
  assert.equal(renovacionPorPagar([recibo()], false)?.pagableOnline, false);
});
