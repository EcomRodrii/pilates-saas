import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recibosCobradosSinFactura, recibosConFacturaAutomaticaAusente } from './facturas-sin-sellar.ts';

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

// C-3 (60ª pasada): antes había aquí un test que exigía lo contrario —que un
// cobro en efectivo NO saliera en «sin factura»— y por eso el cron de
// vigilancia era ciego a los 3 cobros en efectivo sin factura de producción.
// La regla de negocio no ha cambiado (el efectivo no factura SOLO); lo que
// cambia es que «no le toca factura automática» ya no significa «no mirar».
const RECIBOS = [
  { id: 'r-efectivo', studioId: 's1', fechaCobro: '2026-09-10', metodoCobro: 'EFECTIVO' },
  { id: 'r-tarjeta', studioId: 's1', fechaCobro: '2026-09-10', metodoCobro: 'TARJETA' },
  { id: 'r-sinmetodo', studioId: 's1', fechaCobro: '2026-09-10', metodoCobro: null },
];

test('la VIGILANCIA ve también el efectivo: está cobrado y no tiene factura', () => {
  const salida = recibosCobradosSinFactura(RECIBOS, new Set<string>());
  assert.deepEqual(salida.map(r => r.id), ['r-efectivo', 'r-tarjeta', 'r-sinmetodo']);
});

test('la AVERÍA deja fuera el efectivo: no le tocaba factura automática', () => {
  const salida = recibosConFacturaAutomaticaAusente(RECIBOS, new Set<string>());
  assert.deepEqual(salida.map(r => r.id), ['r-tarjeta', 'r-sinmetodo']);
});

test('lo ya facturado no aparece en ninguna de las dos preguntas', () => {
  const todos = new Set(RECIBOS.map(r => r.id));
  assert.deepEqual(recibosCobradosSinFactura(RECIBOS, todos), []);
  assert.deepEqual(recibosConFacturaAutomaticaAusente(RECIBOS, todos), []);
});

