import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  metricasDia, metricasSemana, faltaTexto,
  type SesionMetricaDia, type SesionMetricaAgregada,
} from './calendario-metricas.ts';

const sd = (o: Partial<SesionMetricaDia> & Pick<SesionMetricaDia, 'estado' | 'inicioMin' | 'finMin'>): SesionMetricaDia => ({
  nombre: 'Reformer', lugar: 'Sala Norte', confirmadas: 4, aforoMaximo: 8, ...o,
});

// ── faltaTexto ───────────────────────────────────────────────────────────────

test('faltaTexto: menos de una hora, en minutos', () => {
  assert.equal(faltaTexto(45), 'en 45 min');
});

test('faltaTexto: horas exactas, sin minutos sueltos', () => {
  assert.equal(faltaTexto(120), 'en 2 h');
});

test('faltaTexto: horas y minutos', () => {
  assert.equal(faltaTexto(135), 'en 2 h 15');
});

// ── metricasDia ──────────────────────────────────────────────────────────────

test('con una clase EN_CURSO, "Ahora" la nombra y dice cuándo acaba', () => {
  const [ahora] = metricasDia([sd({ estado: 'EN_CURSO', inicioMin: 480, finMin: 540 })], 500);
  assert.equal(ahora.valor, 'Reformer');
  assert.match(ahora.pie, /acaba 09:00/);
});

test('sin nada EN_CURSO pero con una próxima, "Ahora" dice "Nada en marcha" y apunta a la próxima', () => {
  const [ahora] = metricasDia([sd({ estado: 'PROGRAMADA', inicioMin: 600, finMin: 660 })], 500);
  assert.equal(ahora.valor, 'Nada en marcha');
  assert.match(ahora.pie, /Próxima a las 10:00/);
});

test('sin nada EN_CURSO ni próxima, "Ahora" dice que se acabó el día', () => {
  const [ahora] = metricasDia([sd({ estado: 'FINALIZADA', inicioMin: 480, finMin: 540 })], 600);
  assert.equal(ahora.pie, 'Se acabó el día');
});

test('"Después" apunta a la siguiente clase futura con cuánto falta', () => {
  const [, despues] = metricasDia(
    [sd({ estado: 'PROGRAMADA', inicioMin: 600, finMin: 660, nombre: 'Barre' })],
    480,
  );
  assert.match(despues.valor, /10:00 · Barre/);
  assert.match(despues.pie, /en 2 h/);
});

test('"Después" dice que se acabó el día si no queda nada por venir', () => {
  const [, despues] = metricasDia([sd({ estado: 'FINALIZADA', inicioMin: 480, finMin: 540 })], 600);
  assert.equal(despues.valor, 'Se acabó el día');
});

test('las CANCELADA no cuentan ni para "Ahora"/"Después" ni para la ocupación del día', () => {
  const [ahora, , ocupacion] = metricasDia(
    [sd({ estado: 'CANCELADA', inicioMin: 480, finMin: 540, confirmadas: 8, aforoMaximo: 8 })],
    500,
  );
  assert.equal(ahora.valor, 'Nada en marcha');
  assert.equal(ocupacion.valor, '0%');
});

test('ocupación del día se calcula solo sobre las no canceladas', () => {
  const [, , ocupacion] = metricasDia(
    [
      sd({ estado: 'EN_CURSO', inicioMin: 480, finMin: 540, confirmadas: 4, aforoMaximo: 8 }),
      sd({ estado: 'CANCELADA', inicioMin: 600, finMin: 660, confirmadas: 8, aforoMaximo: 8 }),
    ],
    500,
  );
  assert.equal(ocupacion.valor, '50%');
  assert.ok(ocupacion.barra);
});

// ── metricasSemana ───────────────────────────────────────────────────────────

const sa = (o: Partial<SesionMetricaAgregada> & Pick<SesionMetricaAgregada, 'estado'>): SesionMetricaAgregada => ({
  confirmadas: 4, aforoMaximo: 8, ...o,
});

test('"Clases" cuenta las no canceladas de la semana', () => {
  const [clases] = metricasSemana([sa({ estado: 'PROGRAMADA' }), sa({ estado: 'FINALIZADA' }), sa({ estado: 'CANCELADA' })]);
  assert.equal(clases.valor, '2');
});

test('"Por debajo del 60%" cuenta clases flojas y avisa si hay alguna', () => {
  const [, , flojas] = metricasSemana([
    sa({ estado: 'PROGRAMADA', confirmadas: 2, aforoMaximo: 8 }), // 25%
    sa({ estado: 'PROGRAMADA', confirmadas: 7, aforoMaximo: 8 }), // 87.5%
  ]);
  assert.equal(flojas.valor, '1');
  assert.match(flojas.pie, /revisa su hora/);
});

test('"Por debajo del 60%" en 0 dice que ninguna clase está floja', () => {
  const [, , flojas] = metricasSemana([sa({ estado: 'PROGRAMADA', confirmadas: 7, aforoMaximo: 8 })]);
  assert.equal(flojas.valor, '0');
  assert.match(flojas.pie, /ninguna clase floja/);
});
