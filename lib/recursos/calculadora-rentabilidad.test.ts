import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularRentabilidad, SEMANAS_MES } from './calculadora-rentabilidad.ts';

const BASE = { plazasPorClase: 6, clasesPorSemana: 40, ocupacionPct: 60, ingresoPorPlaza: 15, costeInstructoraPorClase: 20, costesFijosMes: 3000 };

test('ingresos, costes y resultado salen de la fórmula, al mes', () => {
  const r = calcularRentabilidad(BASE);
  const ofertadas = 6 * 40 * SEMANAS_MES;
  assert.ok(Math.abs(r.plazasVendidasMes - ofertadas * 0.6) < 1e-9);
  assert.ok(Math.abs(r.ingresosMes - ofertadas * 0.6 * 15) < 1e-9);
  assert.ok(Math.abs(r.costeInstructorasMes - 40 * 20 * SEMANAS_MES) < 1e-9);
  assert.ok(Math.abs(r.resultadoMes - (r.ingresosMes - r.costeInstructorasMes - 3000)) < 1e-9);
});

test('la ocupación de equilibrio deja el resultado en cero', () => {
  const r = calcularRentabilidad(BASE);
  assert.ok(r.ocupacionEquilibrioPct !== null);
  const enEquilibrio = calcularRentabilidad({ ...BASE, ocupacionPct: r.ocupacionEquilibrioPct! });
  assert.ok(Math.abs(enEquilibrio.resultadoMes) < 1e-6);
});

test('si ni con el estudio lleno se cubren los costes, no hay equilibrio', () => {
  const r = calcularRentabilidad({ ...BASE, costesFijosMes: 100000 });
  assert.equal(r.ocupacionEquilibrioPct, null);
});

test('entradas vacías o negativas cuentan como cero y no rompen nada', () => {
  const r = calcularRentabilidad({ ...BASE, plazasPorClase: Number.NaN, ingresoPorPlaza: -5 });
  assert.equal(r.ingresosMes, 0);
  assert.equal(r.ocupacionEquilibrioPct, null);
  assert.ok(Number.isFinite(r.resultadoMes));
});

test('la ocupación se acota a 100 %', () => {
  assert.equal(calcularRentabilidad({ ...BASE, ocupacionPct: 150 }).plazasVendidasMes, calcularRentabilidad({ ...BASE, ocupacionPct: 100 }).plazasVendidasMes);
});
