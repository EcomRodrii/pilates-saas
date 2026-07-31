import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularScrollInicial } from './calendario-scroll.ts';

const HORA_INICIO = 8 * 60;
const HORA_FIN = 22 * 60;
const PX_HORA = 96;

test('sin "ahora" (día distinto de hoy), abre arriba del todo', () => {
  assert.equal(calcularScrollInicial(null, HORA_INICIO, HORA_FIN, PX_HORA), 0);
});

test('con "ahora" dentro del rango, deja el margen por defecto (60min) de contexto arriba', () => {
  const ahoraMin = 10 * 60; // 10:00
  const r = calcularScrollInicial(ahoraMin, HORA_INICIO, HORA_FIN, PX_HORA);
  // objetivo: (10:00 - 08:00 - 1h) = 1h de scroll = 96px
  assert.equal(r, 96);
});

test('"ahora" justo al abrir el estudio, con margen por defecto se iría negativo → se recorta a 0', () => {
  const ahoraMin = HORA_INICIO + 10; // 08:10
  assert.equal(calcularScrollInicial(ahoraMin, HORA_INICIO, HORA_FIN, PX_HORA), 0);
});

test('"ahora" muy después del cierre, se recorta a la altura total (no se pasa del final)', () => {
  const ahoraMin = HORA_FIN + 300; // muy tarde, para superar también el margen de 60min
  const alturaTotal = ((HORA_FIN - HORA_INICIO) / 60) * PX_HORA;
  assert.equal(calcularScrollInicial(ahoraMin, HORA_INICIO, HORA_FIN, PX_HORA), alturaTotal);
});

test('margen personalizado (0min): scroll exacto hasta "ahora"', () => {
  const ahoraMin = 12 * 60; // 12:00
  const r = calcularScrollInicial(ahoraMin, HORA_INICIO, HORA_FIN, PX_HORA, 0);
  assert.equal(r, ((12 * 60 - HORA_INICIO) / 60) * PX_HORA);
});
