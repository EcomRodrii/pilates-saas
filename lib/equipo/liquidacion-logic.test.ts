import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularLiquidacion } from './liquidacion-logic.ts';

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
