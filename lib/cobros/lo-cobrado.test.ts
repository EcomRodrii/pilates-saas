import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cobradoEnTramo, comoSeCobro, mismoTramoAnterior, moverPeriodo, ORDEN_COMO_SE_COBRO, tramo, tramoVisible } from './lo-cobrado.ts';
import { resumirRecibos } from '../billing/situacion-recibo.ts';

test('los periodos: semana de lunes, mes, trimestre natural y año', () => {
  assert.deepEqual(tramo('DIA', '2026-10-02'), { desde: '2026-10-02', hasta: '2026-10-02' });
  assert.deepEqual(tramo('SEMANA', '2026-10-02'), { desde: '2026-09-28', hasta: '2026-10-04' }, 'el 2-oct-2026 es viernes');
  assert.deepEqual(tramo('SEMANA', '2026-10-04'), { desde: '2026-09-28', hasta: '2026-10-04' }, 'domingo, en su semana');
  assert.deepEqual(tramo('MES', '2026-02-10'), { desde: '2026-02-01', hasta: '2026-02-28' });
  assert.deepEqual(tramo('MES', '2028-02-10'), { desde: '2028-02-01', hasta: '2028-02-29' }, 'bisiesto');
  assert.deepEqual(tramo('TRIMESTRE', '2026-10-02'), { desde: '2026-10-01', hasta: '2026-12-31' });
  assert.deepEqual(tramo('TRIMESTRE', '2026-08-15'), { desde: '2026-07-01', hasta: '2026-09-30' });
  assert.deepEqual(tramo('ANIO', '2026-10-02'), { desde: '2026-01-01', hasta: '2026-12-31' });
});

test('las flechas: el periodo anterior y el siguiente', () => {
  assert.equal(moverPeriodo('MES', '2026-10-02', -1), '2026-09-01');
  assert.equal(moverPeriodo('MES', '2026-01-15', -1), '2025-12-01');
  assert.equal(moverPeriodo('MES', '2026-09-01', 1), '2026-10-01');
  assert.equal(moverPeriodo('SEMANA', '2026-10-02', -1), '2026-09-21');
  assert.equal(moverPeriodo('TRIMESTRE', '2026-01-10', -1), '2025-10-01', 'en enero, el trimestre anterior es el 4.º del año pasado');
  assert.equal(moverPeriodo('DIA', '2026-10-01', -1), '2026-09-30');
});

test('lo que se enseña: hasta hoy en el periodo en curso; entero si ya terminó; nada si es futuro', () => {
  assert.deepEqual(tramoVisible('MES', '2026-10-02', '2026-10-02'), { desde: '2026-10-01', hasta: '2026-10-02' });
  assert.deepEqual(tramoVisible('MES', '2026-09-01', '2026-10-02'), { desde: '2026-09-01', hasta: '2026-09-30' });
  assert.equal(tramoVisible('MES', '2026-11-01', '2026-10-02'), null);
});

test('frente al mismo tramo del periodo anterior', () => {
  // Del 1 al 2 de octubre frente al 1 al 2 de septiembre.
  assert.deepEqual(mismoTramoAnterior('MES', { desde: '2026-10-01', hasta: '2026-10-02' }), { desde: '2026-09-01', hasta: '2026-09-02' });
  // El 31 de octubre frente a septiembre entero (no tiene 31).
  assert.deepEqual(mismoTramoAnterior('MES', { desde: '2026-10-01', hasta: '2026-10-31' }), { desde: '2026-09-01', hasta: '2026-09-30' });
  // El 30 de marzo frente a todo febrero.
  assert.deepEqual(mismoTramoAnterior('MES', { desde: '2026-03-01', hasta: '2026-03-30' }), { desde: '2026-02-01', hasta: '2026-02-28' });
  // Un mes cerrado, frente al anterior entero.
  assert.deepEqual(mismoTramoAnterior('MES', { desde: '2026-09-01', hasta: '2026-09-30' }), { desde: '2026-08-01', hasta: '2026-08-31' });
  // Semana a medias: de lunes a viernes frente a lunes a viernes.
  assert.deepEqual(mismoTramoAnterior('SEMANA', { desde: '2026-09-28', hasta: '2026-10-02' }), { desde: '2026-09-21', hasta: '2026-09-25' });
  // Año hasta hoy frente al mismo día del año anterior; un 29 de febrero, hasta el 28.
  assert.deepEqual(mismoTramoAnterior('ANIO', { desde: '2028-01-01', hasta: '2028-02-29' }), { desde: '2027-01-01', hasta: '2027-02-28' });
  assert.equal(mismoTramoAnterior('DIA', { desde: '2026-10-02', hasta: '2026-10-02' }), null, 'el día va a medias: sin comparación');
});

const c = (id: string, extra: Record<string, unknown>) => ({ id, estado: 'COBRADO', importe: 10, importeDevuelto: 0, fechaCobro: '2026-10-01', metodoCobro: 'EFECTIVO', ...extra });

test('cómo se cobró: el datáfono del mostrador deja cargo de Stripe, así que manda el canal', () => {
  assert.equal(comoSeCobro(c('a', { metodoCobro: 'TARJETA', stripePaymentIntentId: 'pi_1', conciliadoPor: 'webhook' })), 'TARJETA_ONLINE');
  assert.equal(comoSeCobro(c('a', { metodoCobro: 'TARJETA', stripePaymentIntentId: 'pi_1', conciliadoPor: 'tpv' })), 'TARJETA_MOSTRADOR');
  assert.equal(comoSeCobro(c('a', { metodoCobro: 'TARJETA', stripePaymentIntentId: null })), 'TARJETA_MOSTRADOR', 'venta del TPV con datáfono');
  assert.equal(comoSeCobro(c('a', { metodoCobro: 'TARJETA', conciliadoPor: 'manual' })), 'TARJETA_MOSTRADOR');
  // El cobro con su tarjeta sin ella delante (off-session) no marca canal: cargo de Stripe = online.
  assert.equal(comoSeCobro(c('a', { metodoCobro: 'TARJETA', stripePaymentIntentId: 'pi_2', conciliadoPor: null })), 'TARJETA_ONLINE');
  assert.equal(comoSeCobro(c('a', { metodoCobro: 'SEPA' })), 'DOMICILIACION');
  assert.equal(comoSeCobro(c('a', { metodoCobro: null })), 'SIN_ESPECIFICAR');
});

test('lo cobrado en un tramo: neto de lo devuelto, por el día de COBRO, y el desglose suma el total', () => {
  const recibos = [
    c('a', { importe: 89, metodoCobro: 'SEPA' }),
    c('b', { importe: 70, metodoCobro: 'TARJETA', fechaCobro: '2026-10-02' }),
    c('d', { importe: 15, importeDevuelto: 15, estado: 'DEVUELTO', fechaCobro: '2026-10-02' }), // devuelto entero: está, suma 0
    c('p', { importe: 50, importeDevuelto: 20 }), // devuelto en parte: suma 30
    c('n', { importe: 12, metodoCobro: null }),
    c('fuera', { fechaCobro: '2026-09-30' }),
    c('pend', { estado: 'PENDIENTE', fechaCobro: null }),
    c('banco', { estado: 'DEVUELTO', importeDevuelto: 0, fechaCobro: '2026-10-01' }), // lo devolvió el banco: deuda, no cobro
  ];
  const r = cobradoEnTramo(recibos, { desde: '2026-10-01', hasta: '2026-10-02' });
  assert.equal(r.neto, 89 + 70 + 0 + 30 + 12);
  assert.deepEqual(r.recibos.map(x => x.id), ['a', 'b', 'd', 'p', 'n']);
  assert.equal(r.nCobros, 5);
  assert.equal(r.nConDevolucion, 2);
  assert.deepEqual([...r.porDia.entries()], [['2026-10-01', 131], ['2026-10-02', 70]]);
  const sumaMetodos = ORDEN_COMO_SE_COBRO.reduce((t, k) => t + r.porComo[k].neto, 0);
  assert.equal(sumaMetodos, r.neto, 'el desglose por método suma lo mismo que el total');
  assert.equal(r.porComo.SIN_ESPECIFICAR.neto, 12);
  // Y lo mismo que la regla de cifras de siempre, filtrando por fecha de cobro.
  const enTramo = recibos.filter(x => x.fechaCobro && x.fechaCobro >= '2026-10-01' && x.fechaCobro <= '2026-10-02');
  assert.equal(r.neto, resumirRecibos(enTramo).ingresado);
});
