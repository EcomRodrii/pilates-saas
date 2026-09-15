import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ESTADOS_ANULADOS_PARA_EL_MOSTRADOR, ESTADOS_OMITIDA, omitirPorPlazaFijaSinCuota,
} from './penalizacion-aprobar-reglas.ts';

// Política del estudio para plazas fijas sin cuota (migr 20260916090000): con
// LIBERAR o MANTENER_SIN_PENALIZAR no se cobra la penalización de una clase de su
// plaza fija sin cuota. Con MANTENER, las reglas de siempre.

const PF = 'res-pf-00000000-0000-0000-0000-000000000000';
const SUELTA = 'res-abc';

test('solo omite con una política que no cobra, en una reserva del motor y sin cuota', () => {
  for (const politica of ['LIBERAR', 'MANTENER_SIN_PENALIZAR']) {
    assert.equal(omitirPorPlazaFijaSinCuota({ politica, reservaId: PF, cubre: false }), true, politica);
    assert.equal(omitirPorPlazaFijaSinCuota({ politica, reservaId: PF, cubre: true }), false, `${politica} con cuota`);
    assert.equal(omitirPorPlazaFijaSinCuota({ politica, reservaId: SUELTA, cubre: false }), false, `${politica} reserva suelta`);
  }
});

test('como hasta ahora, o sin dato del estudio, se cobra con las reglas de siempre', () => {
  for (const politica of ['MANTENER', null, undefined, 'OTRA']) {
    assert.equal(omitirPorPlazaFijaSinCuota({ politica, reservaId: PF, cubre: false }), false, String(politica));
  }
});

test('el estado nuevo cuenta como omitida, y el mostrador tampoco la cobra', () => {
  assert.ok(ESTADOS_OMITIDA.includes('OMITIDA_SIN_CUOTA'));
  assert.ok(ESTADOS_ANULADOS_PARA_EL_MOSTRADOR.includes('OMITIDA_SIN_CUOTA'));
});
