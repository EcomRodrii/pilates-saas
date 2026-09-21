import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularLiquidacion, periodoLiquidacionDe } from './liquidacion-logic.ts';
import { rangoMesEstudio } from '../fichaje/jornadas-equipo.ts';

const sesion = (id: string, horas: number) => ({
  id, inicio: '2026-08-01T09:00:00.000Z', fin: new Date(new Date('2026-08-01T09:00:00.000Z').getTime() + horas * 3600000).toISOString(),
});

test('base + variable por clases propias, sin sustituciones ni penalizaciones', () => {
  const r = calcularLiquidacion({
    sesionesPropias: [sesion('s1', 1), sesion('s2', 1.5)],
    sesionesSustitucion: [],
    penalizacionesCobradasEur: [],
    tarifa: { tarifaHora: 20, baseMensualEur: 100, recargoSustitucionPct: null },
    repartoPenalizacionPct: null,
  });
  assert.equal(r.baseEur, 100);
  assert.equal(r.nClasesPropias, 2);
  assert.equal(r.variablePropiasEur, 50); // (1 + 1.5) * 20
  assert.equal(r.nClasesSinTarifa, 0);
  assert.equal(r.totalEur, 150);
});

test('sustituciones cubiertas se pagan con recargo sobre la tarifa base', () => {
  const r = calcularLiquidacion({
    sesionesPropias: [],
    sesionesSustitucion: [sesion('s1', 1)],
    penalizacionesCobradasEur: [],
    tarifa: { tarifaHora: 20, baseMensualEur: null, recargoSustitucionPct: 20 },
    repartoPenalizacionPct: null,
  });
  assert.equal(r.baseEur, 0);
  assert.equal(r.nClasesSustitucion, 1);
  assert.equal(r.variableSustitucionEur, 24); // 1h * 20 * 1.2
  assert.equal(r.totalEur, 24);
});

test('sin tarifa fijada: las horas cuentan pero el importe es 0, marcadas explícitamente (no se oculta el hueco)', () => {
  const r = calcularLiquidacion({
    sesionesPropias: [sesion('s1', 2)],
    sesionesSustitucion: [sesion('s2', 1)],
    penalizacionesCobradasEur: [],
    tarifa: { tarifaHora: null, baseMensualEur: 50, recargoSustitucionPct: null },
    repartoPenalizacionPct: null,
  });
  assert.equal(r.variablePropiasEur, 0);
  assert.equal(r.variableSustitucionEur, 0);
  assert.equal(r.nClasesSinTarifa, 2);
  assert.equal(r.totalEur, 50); // solo la base
  assert.ok(r.detalle.some(d => d.tipo === 'propia' && 'sinTarifa' in d && d.sinTarifa));
});

test('reparto de penalizaciones: % del total cobrado en el periodo', () => {
  const r = calcularLiquidacion({
    sesionesPropias: [],
    sesionesSustitucion: [],
    penalizacionesCobradasEur: [15, 15],
    tarifa: { tarifaHora: null, baseMensualEur: null, recargoSustitucionPct: null },
    repartoPenalizacionPct: 50,
  });
  assert.equal(r.nPenalizaciones, 2);
  assert.equal(r.repartoPenalizacionesEur, 15); // 30 * 50%
  assert.equal(r.totalEur, 15);
});

test('reparto desactivado (null/0): las penalizaciones no aportan nada al total aunque haya cobros', () => {
  const r = calcularLiquidacion({
    sesionesPropias: [],
    sesionesSustitucion: [],
    penalizacionesCobradasEur: [50],
    tarifa: { tarifaHora: null, baseMensualEur: null, recargoSustitucionPct: null },
    repartoPenalizacionPct: null,
  });
  assert.equal(r.repartoPenalizacionesEur, 0);
  assert.equal(r.totalEur, 0);
});

test('todo a cero: sin base, sin clases, sin penalizaciones → liquidación vacía sin errores', () => {
  const r = calcularLiquidacion({
    sesionesPropias: [],
    sesionesSustitucion: [],
    penalizacionesCobradasEur: [],
    tarifa: { tarifaHora: null, baseMensualEur: null, recargoSustitucionPct: null },
    repartoPenalizacionPct: null,
  });
  assert.equal(r.totalEur, 0);
  assert.deepEqual(r.detalle, []);
});

test('mezcla realista: base + clases propias + una sustitución con recargo + penalización repartida', () => {
  const r = calcularLiquidacion({
    sesionesPropias: [sesion('s1', 1), sesion('s2', 1)],
    sesionesSustitucion: [sesion('s3', 1)],
    penalizacionesCobradasEur: [20],
    tarifa: { tarifaHora: 25, baseMensualEur: 200, recargoSustitucionPct: 10 },
    repartoPenalizacionPct: 25,
  });
  assert.equal(r.baseEur, 200);
  assert.equal(r.variablePropiasEur, 50); // 2h * 25
  assert.equal(r.variableSustitucionEur, 27.5); // 1h * 25 * 1.1
  assert.equal(r.repartoPenalizacionesEur, 5); // 20 * 25%
  assert.equal(r.totalEur, 282.5);
});

// El mes de una liquidación se corta a medianoche de MADRID, no de UTC. Con
// `Date.UTC` una clase de las 00:30 del día 1 caía en el mes anterior.
const dentro = (r: { desde: string; hasta: string } | null, iso: string) =>
  !!r && Date.parse(iso) >= Date.parse(r.desde) && Date.parse(iso) < Date.parse(r.hasta);

test('periodo de liquidación: septiembre (UTC+2) empieza a las 00:00 de Madrid del día 1', () => {
  const sep = rangoMesEstudio(2026, 9);
  assert.deepEqual(sep, { desde: '2026-08-31T22:00:00.000Z', hasta: '2026-09-30T22:00:00.000Z' });
  // 00:30 del 1-sep en Madrid = 31-ago 22:30 UTC: es de septiembre.
  assert.ok(dentro(sep, '2026-08-31T22:30:00.000Z'));
  assert.ok(!dentro(rangoMesEstudio(2026, 8), '2026-08-31T22:30:00.000Z'));
  assert.deepEqual(periodoLiquidacionDe('2026-08-31T22:30:00.000Z'), { anio: 2026, mes: 9 });
  // 23:59 del 31-ago en Madrid sigue siendo agosto.
  assert.deepEqual(periodoLiquidacionDe('2026-08-31T21:59:00.000Z'), { anio: 2026, mes: 8 });
});

test('periodo de liquidación: octubre cruza el cambio de hora y acaba en UTC+1', () => {
  const oct = rangoMesEstudio(2026, 10);
  assert.deepEqual(oct, { desde: '2026-09-30T22:00:00.000Z', hasta: '2026-10-31T23:00:00.000Z' });
  // 01:30 del 1-oct en Madrid (verano) = 30-sep 23:30 UTC: octubre.
  assert.ok(dentro(oct, '2026-09-30T23:30:00.000Z'));
  // 23:30 del 31-oct en Madrid (ya invierno) = 22:30 UTC: todavía octubre.
  assert.ok(dentro(oct, '2026-10-31T22:30:00.000Z'));
  assert.deepEqual(periodoLiquidacionDe('2026-10-31T22:30:00.000Z'), { anio: 2026, mes: 10 });
  // 00:30 del 1-nov en Madrid (invierno) = 31-oct 23:30 UTC: noviembre.
  assert.ok(!dentro(oct, '2026-10-31T23:30:00.000Z'));
  assert.deepEqual(periodoLiquidacionDe('2026-10-31T23:30:00.000Z'), { anio: 2026, mes: 11 });
});

test('periodo de liquidación: diciembre → enero cambia de año a medianoche de Madrid', () => {
  assert.deepEqual(rangoMesEstudio(2026, 12), { desde: '2026-11-30T23:00:00.000Z', hasta: '2026-12-31T23:00:00.000Z' });
  assert.deepEqual(rangoMesEstudio(2027, 1), { desde: '2026-12-31T23:00:00.000Z', hasta: '2027-01-31T23:00:00.000Z' });
  // 00:30 del 1-ene-2027 en Madrid = 31-dic-2026 23:30 UTC: enero de 2027.
  assert.ok(dentro(rangoMesEstudio(2027, 1), '2026-12-31T23:30:00.000Z'));
  assert.ok(!dentro(rangoMesEstudio(2026, 12), '2026-12-31T23:30:00.000Z'));
  assert.deepEqual(periodoLiquidacionDe('2026-12-31T23:30:00.000Z'), { anio: 2027, mes: 1 });
});

test('periodoLiquidacionDe y rangoMesEstudio coinciden en cada borde del año', () => {
  // Lo que genera la liquidación (rango) y lo que marca para revisión una
  // penalización revertida (periodo) tienen que hablar del MISMO mes.
  for (let mes = 1; mes <= 12; mes++) {
    const r = rangoMesEstudio(2026, mes)!;
    assert.deepEqual(periodoLiquidacionDe(r.desde), { anio: 2026, mes }, `inicio de ${mes}`);
    const ultimoMinuto = new Date(Date.parse(r.hasta) - 60000).toISOString();
    assert.deepEqual(periodoLiquidacionDe(ultimoMinuto), { anio: 2026, mes }, `final de ${mes}`);
  }
  assert.equal(periodoLiquidacionDe('no-es-fecha'), null);
});

// ── Liquidar por horas fichadas (opcional por estudio) ──
const clase = (id: string, h: number) => ({ id, inicio: '2026-09-15T08:00:00.000Z', fin: new Date(Date.parse('2026-09-15T08:00:00.000Z') + h * 3600_000).toISOString() });
const TARIFA_FICHAJE = { tarifaHora: 20, baseMensualEur: 100, recargoSustitucionPct: 50 };

test('sin modo, calcula por clases como siempre (compatibilidad)', () => {
  const r = calcularLiquidacion({ sesionesPropias: [clase('a', 1)], sesionesSustitucion: [clase('b', 1)], penalizacionesCobradasEur: [], tarifa: TARIFA_FICHAJE, repartoPenalizacionPct: null });
  assert.equal(r.modo, 'CLASES');
  assert.equal(r.variablePropiasEur, 20);
  assert.equal(r.variableSustitucionEur, 30);
  assert.equal(r.minutosFichados, null);
  assert.equal(r.jornadasSinCerrar, 0);
  assert.equal(r.totalEur, 150);
});

test('por horas fichadas: variable = horas cerradas × tarifa, sin recargo; base y penalizaciones igual', () => {
  const r = calcularLiquidacion({
    sesionesPropias: [clase('a', 1)], sesionesSustitucion: [clase('b', 1)], penalizacionesCobradasEur: [10],
    tarifa: TARIFA_FICHAJE, repartoPenalizacionPct: 50,
    modo: 'HORAS_FICHADAS', fichaje: { minutosCerrados: 450, jornadasSinCerrar: 0 },
  });
  assert.equal(r.modo, 'HORAS_FICHADAS');
  assert.equal(r.variablePropiasEur, 150); // 7,5 h × 20
  assert.equal(r.variableSustitucionEur, 0);
  assert.equal(r.repartoPenalizacionesEur, 5);
  assert.equal(r.totalEur, 255); // 100 + 150 + 5
  assert.equal(r.minutosFichados, 450);
  // Las clases se siguen contando, como información.
  assert.equal(r.nClasesPropias, 1);
  assert.equal(r.nClasesSustitucion, 1);
  assert.deepEqual(r.detalle.filter((d) => d.tipo !== 'penalizaciones'), [{ tipo: 'fichado', horas: 7.5, importe: 150, sinTarifa: false }]);
});

test('por horas fichadas: las jornadas sin cerrar no se pagan pero quedan contadas', () => {
  const r = calcularLiquidacion({
    sesionesPropias: [], sesionesSustitucion: [], penalizacionesCobradasEur: [], tarifa: TARIFA_FICHAJE, repartoPenalizacionPct: null,
    modo: 'HORAS_FICHADAS', fichaje: { minutosCerrados: 60, jornadasSinCerrar: 2 },
  });
  assert.equal(r.variablePropiasEur, 20);
  assert.equal(r.jornadasSinCerrar, 2);
});

test('por horas fichadas sin tarifa: importe 0 y avisa como en el otro modo', () => {
  const r = calcularLiquidacion({
    sesionesPropias: [clase('a', 1)], sesionesSustitucion: [], penalizacionesCobradasEur: [],
    tarifa: { tarifaHora: null, baseMensualEur: null, recargoSustitucionPct: null }, repartoPenalizacionPct: null,
    modo: 'HORAS_FICHADAS', fichaje: { minutosCerrados: 120, jornadasSinCerrar: 0 },
  });
  assert.equal(r.variablePropiasEur, 0);
  assert.equal(r.nClasesSinTarifa, 1);
  assert.equal(r.totalEur, 0);
});

test('por horas fichadas sin datos de fichaje: falla en vez de pagar 0', () => {
  assert.throws(() => calcularLiquidacion({
    sesionesPropias: [], sesionesSustitucion: [], penalizacionesCobradasEur: [], tarifa: TARIFA_FICHAJE, repartoPenalizacionPct: null,
    modo: 'HORAS_FICHADAS',
  }));
});
