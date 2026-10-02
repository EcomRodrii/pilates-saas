import { test } from 'node:test';
import assert from 'node:assert/strict';
import { averiasRecientes, cobradoConFacturaSiempre, recibosCobradosSinFactura, recibosConFacturaAutomaticaAusente } from './facturas-sin-sellar.ts';

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


test('avería reciente: solo pasado el reintento de 72 h y dentro de los 10 días', () => {
  const ahora = new Date('2026-09-22T07:20:00Z');
  const r = (id: string, fechaCobro: string | null) => ({ id, studioId: 's', fechaCobro, metodoCobro: 'TARJETA' });
  const out = averiasRecientes([
    r('en-reintento', '2026-09-20T10:00:00Z'),
    r('reciente', '2026-09-17T10:00:00Z'),
    r('atasco-viejo', '2026-08-20T10:00:00Z'),
    r('sin-fecha', null),
  ], ahora);
  assert.deepEqual(out.map(x => x.id), ['reciente']);
});

test('«Hacerle factura» en efectivo que no llegó a sellarse es avería, como la de tarjeta', () => {
  const efectivo = [
    { id: 'pedida', studioId: 's', fechaCobro: '2026-10-01', metodoCobro: 'EFECTIVO', facturaPendienteSellar: true },
    { id: 'sin-pedir', studioId: 's', fechaCobro: '2026-10-01', metodoCobro: 'EFECTIVO', facturaPendienteSellar: false },
  ];
  assert.deepEqual(recibosConFacturaAutomaticaAusente(efectivo, new Set<string>()).map(r => r.id), ['pedida']);
});

test('factura siempre: solo vigila los cobros desde el 4-oct-2026 (hora de Madrid), nunca hacia atrás', () => {
  assert.equal(cobradoConFacturaSiempre({ fechaCobro: '2026-10-03' }), false, 'el día de margen todavía no');
  assert.equal(cobradoConFacturaSiempre({ fechaCobro: '2026-10-04' }), true);
  assert.equal(cobradoConFacturaSiempre({ fechaCobro: '2026-10-03T21:59:00Z' }), false);
  assert.equal(cobradoConFacturaSiempre({ fechaCobro: '2026-10-03T22:00:00Z' }), true);
  assert.equal(cobradoConFacturaSiempre({ fechaCobro: null }), false, 'sin fecha no se sabe si es de antes');
});

test('un cobro con un movimiento del banco cuenta desde que se CONFIRMÓ, no desde su fecha real', () => {
  // Pagó el 25-sep, se confirmó con el extracto el 5-oct: la factura se pide al confirmar.
  const externo = { fechaCobro: '2026-09-25', conciliadoPor: 'externo', conciliadoEn: '2026-10-05T09:00:00Z' };
  assert.equal(cobradoConFacturaSiempre(externo), true);
  assert.equal(cobradoConFacturaSiempre({ ...externo, conciliadoPor: 'manual' }), false, 'el resto, por su fecha de cobro');
  const r = { id: 'rec-1', studioId: 'st', metodoCobro: 'TRANSFERENCIA', ...externo };
  // A las 80 h de confirmarlo (13 días después de su fecha real) sigue siendo una avería reciente.
  assert.deepEqual(averiasRecientes([r], new Date('2026-10-08T17:00:00Z')).map(x => x.id), ['rec-1']);
});
