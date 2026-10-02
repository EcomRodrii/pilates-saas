import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entraEnCobroEnLote } from './cobro-en-lote.ts';
import { estaSinCobrar } from '../billing/situacion-recibo.ts';

// «Cobrar varias a la vez»: todo lo que se DEBE, menos lo que está en el banco y
// lo que el cobro automático ya tiene programado.

const r = (p: Record<string, unknown>) => ({ socioId: 's1', importe: 30, importeDevuelto: 0, ...p }) as Parameters<typeof entraEnCobroEnLote>[0];

test('entran lo pendiente, lo rechazado y lo devuelto por el banco (antes solo lo pendiente con plan activo)', () => {
  for (const estado of ['PENDIENTE', 'FALLIDO', 'DEVUELTO']) assert.equal(entraEnCobroEnLote(r({ estado })), true, estado);
});

test('no entran: lo que está en el banco, lo que se reintenta solo, lo reembolsado, lo cobrado ni lo que no tiene clienta', () => {
  assert.equal(entraEnCobroEnLote(r({ estado: 'EN_CURSO' })), false, 'el banco aún no ha contestado');
  assert.equal(entraEnCobroEnLote(r({ estado: 'PENDIENTE', proximoReintento: '2026-10-05T08:00:00Z' })), false, 'se cobraría dos veces');
  assert.equal(entraEnCobroEnLote(r({ estado: 'DEVUELTO', importeDevuelto: 30 })), false, 'un reembolso no se vuelve a cobrar');
  assert.equal(entraEnCobroEnLote(r({ estado: 'COBRADO' })), false);
  assert.equal(entraEnCobroEnLote(r({ estado: 'ANULADO' })), false);
  assert.equal(entraEnCobroEnLote(r({ estado: 'PENDIENTE', socioId: null })), false);
});

test('es «Sin cobrar» menos lo que está en el banco y lo programado', () => {
  for (const estado of ['PENDIENTE', 'FALLIDO', 'DEVUELTO', 'EN_CURSO', 'COBRADO', 'ANULADO']) {
    for (const importeDevuelto of [0, 30]) {
      for (const proximoReintento of [null, '2026-10-05T08:00:00Z']) {
        const recibo = r({ estado, importeDevuelto, proximoReintento });
        const esperado = estaSinCobrar(recibo) && estado !== 'EN_CURSO' && !proximoReintento;
        assert.equal(entraEnCobroEnLote(recibo), esperado, JSON.stringify(recibo));
      }
    }
  }
});
