import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recibosCobradosSinFactura } from './facturas-sin-sellar.ts';

test('un recibo sin factura sale en el resultado', () => {
  const r = recibosCobradosSinFactura(
    [{ id: 'rec-1', studioId: 's1', fechaCobro: '2026-08-01' }],
    new Set(),
  );
  assert.deepEqual(r, [{ id: 'rec-1', studioId: 's1', fechaCobro: '2026-08-01' }]);
});

test('un recibo con factura no sale', () => {
  const r = recibosCobradosSinFactura(
    [{ id: 'rec-1', studioId: 's1', fechaCobro: '2026-08-01' }],
    new Set(['rec-1']),
  );
  assert.deepEqual(r, []);
});

test('mezcla: solo los que faltan, y de cualquier estudio', () => {
  const recibos = [
    { id: 'a', studioId: 's1', fechaCobro: null },
    { id: 'b', studioId: 's1', fechaCobro: null },
    { id: 'c', studioId: 's2', fechaCobro: null },
  ];
  const r = recibosCobradosSinFactura(recibos, new Set(['b']));
  assert.deepEqual(r.map(x => x.id), ['a', 'c']);
});

test('sin recibos: lista vacía, no revienta con un set vacío', () => {
  assert.deepEqual(recibosCobradosSinFactura([], new Set()), []);
});
