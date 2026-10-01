import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esVentaSinRecibo, resumenVentasSinRecibo } from './ventas-sin-recibo.ts';

test('solo una venta PAGADA, con importe y sin recibo', () => {
  assert.equal(esVentaSinRecibo({ estado: 'PAGADA', reciboId: null, total: 21 }), true);
  assert.equal(esVentaSinRecibo({ estado: 'PAGADA', reciboId: 'rec-pos-1', total: 21 }), false);
  // Sin cobrar todavía, o anulada: no es dinero que falte en las cifras.
  assert.equal(esVentaSinRecibo({ estado: 'PENDIENTE_PAGO', reciboId: null, total: 21 }), false);
  assert.equal(esVentaSinRecibo({ estado: 'ANULADA', reciboId: null, total: 21 }), false);
  // Gratis: no hay recibo que crear.
  assert.equal(esVentaSinRecibo({ estado: 'PAGADA', reciboId: null, total: 0 }), false);
});

test('resume cuántas son y cuánto suman, a céntimos', () => {
  const r = resumenVentasSinRecibo([
    { estado: 'PAGADA', reciboId: null, total: '157.50' },
    { estado: 'PAGADA', reciboId: null, total: 22.1 },
    { estado: 'PAGADA', reciboId: 'rec-pos-x', total: 99 },
  ]);
  assert.deepEqual(r, { n: 2, total: 179.6 });
});
