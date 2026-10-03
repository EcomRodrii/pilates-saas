import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cobradoEnTramo, comoSeCobro, mismoTramoAnterior, moverPeriodo, ORDEN_COMO_SE_COBRO, textoDeLaComparacion, textoDelDia, textoDelPeriodo, tramo, tramoVisible } from './lo-cobrado.ts';
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

test('el trimestre a medias se compara por posición de mes y día, no por días transcurridos', () => {
  // El 31 de mayo (2.º mes, día 31) frente al 28 de febrero: con días
  // transcurridos (60) llegaba al 2 de marzo y metía dos días del 3.er mes.
  assert.deepEqual(mismoTramoAnterior('TRIMESTRE', { desde: '2026-04-01', hasta: '2026-05-31' }), { desde: '2026-01-01', hasta: '2026-02-28' });
  assert.deepEqual(mismoTramoAnterior('TRIMESTRE', { desde: '2028-04-01', hasta: '2028-05-31' }), { desde: '2028-01-01', hasta: '2028-02-29' }, 'bisiesto');
  // El 15 de octubre (1.er mes) frente al 15 de julio; cruzando de año, del 4.º trimestre.
  assert.deepEqual(mismoTramoAnterior('TRIMESTRE', { desde: '2026-10-01', hasta: '2026-10-15' }), { desde: '2026-07-01', hasta: '2026-07-15' });
  assert.deepEqual(mismoTramoAnterior('TRIMESTRE', { desde: '2027-01-01', hasta: '2027-03-31' }), { desde: '2026-10-01', hasta: '2026-12-31' }, 'cerrado: el anterior entero');
  assert.deepEqual(mismoTramoAnterior('TRIMESTRE', { desde: '2027-01-01', hasta: '2027-02-10' }), { desde: '2026-10-01', hasta: '2026-11-10' });
  // El 29 de septiembre (3.er mes) frente al 29 de junio.
  assert.deepEqual(mismoTramoAnterior('TRIMESTRE', { desde: '2026-07-01', hasta: '2026-09-29' }), { desde: '2026-04-01', hasta: '2026-06-29' });
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
  // El devuelto entero está en la lista, pero no cuenta como cobro (ni va al fichero).
  assert.equal(r.nCobros, 4);
  assert.equal(r.nConDevolucion, 2);
  assert.deepEqual([...r.porDia.entries()], [['2026-10-01', 131], ['2026-10-02', 70]]);
  const sumaMetodos = ORDEN_COMO_SE_COBRO.reduce((t, k) => t + r.porComo[k].neto, 0);
  assert.equal(sumaMetodos, r.neto, 'el desglose por método suma lo mismo que el total');
  assert.equal(r.porComo.SIN_ESPECIFICAR.neto, 12);
  // Y lo mismo que la regla de cifras de siempre, filtrando por fecha de cobro.
  const enTramo = recibos.filter(x => x.fechaCobro && x.fechaCobro >= '2026-10-01' && x.fechaCobro <= '2026-10-02');
  assert.equal(r.neto, resumirRecibos(enTramo).ingresado);
});

test('la hora del cobro, solo cuando es de verdad la del cobro (y en hora de Madrid)', async () => {
  const { horaDelCobro } = await import('./lo-cobrado.ts');
  assert.equal(horaDelCobro({ cobradoEn: '2026-10-02T10:40:00Z', fechaCobro: '2026-10-02' }), '12:40', 'en verano, UTC+2');
  assert.equal(horaDelCobro({ cobradoEn: '2026-12-02T10:40:00Z', fechaCobro: '2026-12-02' }), '11:40', 'en invierno, UTC+1');
  // A las 23:30 UTC del 1 ya es día 2 en Madrid.
  assert.equal(horaDelCobro({ cobradoEn: '2026-10-01T23:30:00Z', fechaCobro: '2026-10-02' }), '01:30');
  assert.equal(horaDelCobro({ cobradoEn: '2026-10-01T23:30:00Z', fechaCobro: '2026-10-01' }), null, 'otro día: no es la hora del cobro');
  assert.equal(horaDelCobro({ cobradoEn: null, fechaCobro: '2026-10-02' }), null, 'lo antiguo, sin hora');
  assert.equal(horaDelCobro({ cobradoEn: '2026-10-02T10:40:00Z', fechaCobro: null }), null);
});

test('los textos del periodo, del día y de la comparación', () => {
  const hoy = '2026-10-02'; // viernes
  assert.equal(textoDelPeriodo('DIA', hoy, hoy), 'Hoy');
  assert.equal(textoDelPeriodo('DIA', '2026-10-01', hoy), 'Ayer');
  assert.equal(textoDelPeriodo('DIA', '2026-09-29', hoy), 'Mar 29 sep');
  assert.equal(textoDelPeriodo('SEMANA', hoy, hoy), 'Esta semana');
  assert.equal(textoDelPeriodo('SEMANA', '2026-09-22', hoy), '21 sep – 27 sep');
  assert.equal(textoDelPeriodo('MES', hoy, hoy), 'Octubre');
  assert.equal(textoDelPeriodo('MES', '2025-12-10', hoy), 'Diciembre de 2025');
  assert.equal(textoDelDia(hoy, hoy), 'Hoy, viernes 2 de octubre');
  assert.equal(textoDelDia('2026-10-01', hoy), 'Ayer, jueves 1 de octubre');
  assert.equal(textoDelDia('2026-09-30', hoy), 'Miércoles 30 de septiembre');
  const octubre = tramoVisible('MES', hoy, hoy)!;
  assert.equal(textoDeLaComparacion('MES', octubre, hoy), 'septiembre a estas alturas');
  assert.equal(textoDeLaComparacion('MES', tramoVisible('MES', '2026-09-10', hoy)!, hoy), 'agosto');
  assert.equal(textoDeLaComparacion('MES', tramoVisible('MES', '2026-01-10', hoy)!, hoy), 'diciembre de 2025');
  assert.equal(textoDeLaComparacion('SEMANA', tramoVisible('SEMANA', hoy, hoy)!, hoy), 'la semana anterior a estas alturas');
  assert.equal(textoDeLaComparacion('DIA', tramoVisible('DIA', hoy, hoy)!, hoy), null);
});
