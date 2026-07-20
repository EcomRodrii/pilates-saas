import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  riesgoNoShow, explicarRiesgo, MINIMO_RESUELTAS, UMBRAL_ALTO, UMBRAL_MEDIO,
  type ReservaHistorica,
} from './no-show.ts';

const NOW = new Date('2026-07-20T12:00:00Z');
const MS_DIA = 86400000;

/** Reserva a N días en el pasado. */
function r(estado: string, diasAtras: number): ReservaHistorica {
  return { estado, fecha: new Date(NOW.getTime() - diasAtras * MS_DIA).toISOString() };
}

test('sin historial suficiente → SIN_DATOS (no se dispara con poco dato)', () => {
  assert.equal(riesgoNoShow([], NOW).nivel, 'SIN_DATOS');
  assert.equal(riesgoNoShow([r('NO_ASISTIO', 2)], NOW).nivel, 'SIN_DATOS');
  const dos = [r('NO_ASISTIO', 2), r('NO_ASISTIO', 5)];
  assert.equal(riesgoNoShow(dos, NOW).resueltas, 0, 'por debajo del mínimo no puntúa');
  assert.equal(riesgoNoShow(dos, NOW).nivel, 'SIN_DATOS');
});

test('1 de 1 NO es 100% de riesgo (suavizado bayesiano)', () => {
  // 3 resueltas, todas plantón → alto, pero lejos de 100 gracias al prior.
  const res = riesgoNoShow([r('NO_ASISTIO', 1), r('NO_ASISTIO', 3), r('NO_ASISTIO', 6)], NOW);
  assert.equal(res.nivel, 'ALTO');
  assert.ok(res.score < 90, `esperaba < 90 por el suavizado, fue ${res.score}`);
  assert.ok(res.score >= UMBRAL_ALTO);
});

test('asistencia perfecta → riesgo bajo', () => {
  const historial = [r('ASISTIDA', 2), r('ASISTIDA', 9), r('ASISTIDA', 16), r('ASISTIDA', 23)];
  const res = riesgoNoShow(historial, NOW);
  assert.equal(res.nivel, 'BAJO');
  assert.equal(res.noShows, 0);
  assert.ok(res.score < UMBRAL_MEDIO);
});

test('CANCELADA no cuenta: cancelar a tiempo no es un plantón', () => {
  const conCancelaciones = [r('ASISTIDA', 2), r('ASISTIDA', 5), r('ASISTIDA', 8), r('CANCELADA', 3), r('CANCELADA', 6)];
  const res = riesgoNoShow(conCancelaciones, NOW);
  assert.equal(res.resueltas, 3, 'las canceladas quedan fuera del denominador');
  assert.equal(res.noShows, 0);
});

test('la recencia pesa: los mismos plantones recientes puntúan más que antiguos', () => {
  const recientes = [r('NO_ASISTIO', 1), r('NO_ASISTIO', 4), r('ASISTIDA', 7), r('ASISTIDA', 10)];
  const antiguos = [r('NO_ASISTIO', 70), r('NO_ASISTIO', 75), r('ASISTIDA', 78), r('ASISTIDA', 80)];
  const a = riesgoNoShow(recientes, NOW).score;
  const b = riesgoNoShow(antiguos, NOW).score;
  assert.ok(a > b, `reciente (${a}) debería superar a antiguo (${b})`);
});

test('fuera de la ventana de 90 días no cuenta', () => {
  const viejos = [r('NO_ASISTIO', 100), r('NO_ASISTIO', 120), r('NO_ASISTIO', 200)];
  assert.equal(riesgoNoShow(viejos, NOW).nivel, 'SIN_DATOS');
});

test('fechas futuras o inválidas se ignoran', () => {
  const conFuturas: ReservaHistorica[] = [
    r('ASISTIDA', 2), r('ASISTIDA', 5), r('ASISTIDA', 8),
    { estado: 'NO_ASISTIO', fecha: new Date(NOW.getTime() + 5 * MS_DIA).toISOString() },
    { estado: 'NO_ASISTIO', fecha: 'no-es-fecha' },
  ];
  const res = riesgoNoShow(conFuturas, NOW);
  assert.equal(res.resueltas, 3, 'la futura y la inválida no entran');
  assert.equal(res.noShows, 0);
});

test('mezcla realista: falla ~1 de 3 recientes → riesgo medio o alto, nunca bajo', () => {
  const historial = [
    r('NO_ASISTIO', 3), r('ASISTIDA', 6), r('ASISTIDA', 10),
    r('NO_ASISTIO', 14), r('ASISTIDA', 17), r('ASISTIDA', 21),
  ];
  const res = riesgoNoShow(historial, NOW);
  assert.ok(res.score >= UMBRAL_MEDIO, `esperaba >= ${UMBRAL_MEDIO}, fue ${res.score}`);
  assert.notEqual(res.nivel, 'BAJO');
});

test('es determinista: mismas entradas → mismo score', () => {
  const h = [r('NO_ASISTIO', 3), r('ASISTIDA', 6), r('ASISTIDA', 10)];
  assert.equal(riesgoNoShow(h, NOW).score, riesgoNoShow(h, NOW).score);
});

test('el mínimo de reservas resueltas es el declarado', () => {
  const justoDebajo = Array.from({ length: MINIMO_RESUELTAS - 1 }, (_, i) => r('ASISTIDA', i + 1));
  const justo = Array.from({ length: MINIMO_RESUELTAS }, (_, i) => r('ASISTIDA', i + 1));
  assert.equal(riesgoNoShow(justoDebajo, NOW).nivel, 'SIN_DATOS');
  assert.notEqual(riesgoNoShow(justo, NOW).nivel, 'SIN_DATOS');
});

test('explicarRiesgo da una frase humana', () => {
  const res = riesgoNoShow([r('NO_ASISTIO', 3), r('ASISTIDA', 6), r('ASISTIDA', 10)], NOW);
  assert.match(explicarRiesgo(res), /1 de 3/);
  assert.equal(explicarRiesgo({ score: 0, nivel: 'SIN_DATOS', noShows: 0, resueltas: 0, ratioCrudo: 0 }), 'Sin historial suficiente');
});
