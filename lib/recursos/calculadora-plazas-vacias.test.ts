import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularPlazasVacias } from './calculadora-plazas-vacias.ts';

test('8 reformers, 30 clases, 80 % y 18,75 €: unas 208 plazas vacías y 3.900 € al mes', () => {
  const r = calcularPlazasVacias({ reformers: 8, clasesPorSemana: 30, ocupacionPct: 80, ingresoPorPlaza: 18.75 });
  assert.equal(Math.round(r.plazasOfertadasMes), 1040);
  assert.equal(Math.round(r.plazasVaciasMes), 208);
  assert.equal(Math.round(r.ingresoNoVendidoMes), 3900);
  assert.equal(Math.round(r.ingresoNoVendidoAno), 46800);
});

test('con la sala llena no hay nada que perder', () => {
  const r = calcularPlazasVacias({ reformers: 6, clasesPorSemana: 20, ocupacionPct: 100, ingresoPorPlaza: 25 });
  assert.equal(r.plazasVaciasMes, 0);
  assert.equal(r.ingresoNoVendidoMes, 0);
});

test('un campo vacío o negativo cuenta como cero y una ocupación por encima de 100 se queda en 100', () => {
  assert.equal(calcularPlazasVacias({ reformers: Number.NaN, clasesPorSemana: 30, ocupacionPct: 50, ingresoPorPlaza: 20 }).ingresoNoVendidoMes, 0);
  assert.equal(calcularPlazasVacias({ reformers: 8, clasesPorSemana: 30, ocupacionPct: 140, ingresoPorPlaza: 20 }).plazasVaciasMes, 0);
  assert.equal(calcularPlazasVacias({ reformers: 8, clasesPorSemana: -3, ocupacionPct: 50, ingresoPorPlaza: 20 }).plazasOfertadasMes, 0);
});
