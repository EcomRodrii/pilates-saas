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

test('los cobros en efectivo NO cuentan como «sin factura»', () => {
  // ⚠️ Desde que el efectivo no factura solo, un cobro en efectivo sin factura
  // no es una avería: es la regla. Si entrara aquí, dispararía el aviso de
  // Sentry del conciliador en cada cobro y pintaría el botón rojo «Sin
  // factura» —que reintenta el sellado y desharía la regla de un clic—.
  const recibos = [
    { id: 'r-efectivo', studioId: 's1', fechaCobro: '2026-09-10', metodoCobro: 'EFECTIVO' },
    { id: 'r-tarjeta', studioId: 's1', fechaCobro: '2026-09-10', metodoCobro: 'TARJETA' },
    { id: 'r-sinmetodo', studioId: 's1', fechaCobro: '2026-09-10', metodoCobro: null },
  ];
  const salida = recibosCobradosSinFactura(recibos, new Set<string>());
  assert.deepEqual(salida.map(r => r.id), ['r-tarjeta', 'r-sinmetodo']);
});

test('y si el de efectivo SÍ tiene factura, tampoco aparece', () => {
  // La emisión manual sigue disponible: quien la pida, la tiene. Una vez
  // emitida, este listado no tiene nada que decir de ella.
  const salida = recibosCobradosSinFactura(
    [{ id: 'r-efectivo', studioId: 's1', fechaCobro: '2026-09-10', metodoCobro: 'EFECTIVO' }],
    new Set(['r-efectivo']),
  );
  assert.deepEqual(salida, []);
});
