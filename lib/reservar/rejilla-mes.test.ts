import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rejillaMes, disponibilidadDe, resumenDia, etiquetaDia, etiquetaMes,
  type ClaseDelMes, type DiaMes,
} from './rejilla-mes.ts';

// Agosto de 2026: empieza en SÁBADO y tiene 31 días — el peor caso de relleno
// por los dos lados, que es justo el que descuadra una rejilla mal montada.
const ANCLA = new Date(2026, 7, 12);
const HOY = new Date(2026, 7, 12);

const clase = (inicio: string, aforoMaximo = 10, ocupadas = 0): ClaseDelMes =>
  ({ inicio, aforoMaximo, ocupadas });

const dia = (r: DiaMes[], fecha: string) => r.find((d) => d.fecha === fecha)!;

test('la rejilla empieza en lunes y cubre el mes entero', () => {
  const r = rejillaMes(ANCLA, [], HOY);
  // 1 de agosto de 2026 es sábado → la primera fila arranca el lunes 27 de julio.
  assert.equal(r[0].fecha, '2026-07-27');
  assert.equal(r[0].delMes, false);
  assert.ok(r.some((d) => d.fecha === '2026-08-01' && d.delMes));
  assert.ok(r.some((d) => d.fecha === '2026-08-31' && d.delMes));
});

test('siempre son semanas completas, y ni una de más', () => {
  const r = rejillaMes(ANCLA, [], HOY);
  assert.equal(r.length % 7, 0);
  // La última celda es el domingo de la semana del día 31 (lunes) → 6 sept.
  assert.equal(r[r.length - 1].fecha, '2026-09-06');
  // Y ninguna fila entera fuera del mes: una fila vacía se lee como «esa semana
  // no hay nada», que es mentira — es que no existe.
  const filas = Array.from({ length: r.length / 7 }, (_, i) => r.slice(i * 7, i * 7 + 7));
  assert.ok(filas.every((f) => f.some((d) => d.delMes)));
});

test('un mes que empieza en lunes no lleva relleno por delante', () => {
  // Junio de 2026 empieza en lunes.
  const r = rejillaMes(new Date(2026, 5, 10), [], HOY);
  assert.equal(r[0].fecha, '2026-06-01');
  assert.equal(r[0].delMes, true);
});

test('las clases se agrupan por día, sumando plazas libres', () => {
  const r = rejillaMes(ANCLA, [
    clase('2026-08-13T10:00:00', 10, 8),
    clase('2026-08-13T18:00:00', 10, 7),
    clase('2026-08-14T10:00:00', 10, 10),
  ], HOY);
  assert.equal(dia(r, '2026-08-13').clases, 2);
  assert.equal(dia(r, '2026-08-13').plazasLibres, 5);
  assert.equal(dia(r, '2026-08-14').clases, 1);
  assert.equal(dia(r, '2026-08-14').plazasLibres, 0);
});

test('⚠️ una clase con overbooking no resta plazas a las demás del día', () => {
  // Pasa si se baja el aforo después de llenarse. Sin acotar a 0, este día
  // saldría con MENOS plazas libres de las que de verdad quedan.
  const r = rejillaMes(ANCLA, [
    clase('2026-08-13T10:00:00', 5, 9),
    clase('2026-08-13T18:00:00', 10, 4),
  ], HOY);
  assert.equal(dia(r, '2026-08-13').plazasLibres, 6);
});

test('⚠️ un día LLENO no es un día SIN CLASES', () => {
  // Son dos cosas distintas y la página las pinta distinto. Confundirlas haría
  // desaparecer del calendario justo el día que interesa para la lista de
  // espera.
  assert.equal(disponibilidadDe(0, 0), 'sin-clases');
  assert.equal(disponibilidadDe(3, 0), 'completo');
});

test('la densidad mide DISPONIBILIDAD, no cuántas clases hay', () => {
  // El día con más clases del mes puede ser el peor para reservar. Es la
  // diferencia con la vista mes del panel, que pinta ocupación a propósito.
  const r = rejillaMes(ANCLA, [
    clase('2026-08-13T09:00:00', 10, 10),
    clase('2026-08-13T11:00:00', 10, 10),
    clase('2026-08-13T18:00:00', 10, 10),
    clase('2026-08-14T10:00:00', 10, 1),
  ], HOY);
  assert.equal(dia(r, '2026-08-13').disponibilidad, 'completo');
  assert.equal(dia(r, '2026-08-14').disponibilidad, 'libre');
});

test('con pocas plazas se avisa de que son las últimas', () => {
  assert.equal(disponibilidadDe(1, 1), 'ultimas');
  assert.equal(disponibilidadDe(1, 2), 'ultimas');
  assert.equal(disponibilidadDe(1, 3), 'libre');
});

test('los días ya pasados se marcan, y hoy NO lo está', () => {
  const r = rejillaMes(ANCLA, [], HOY);
  assert.equal(dia(r, '2026-08-11').pasado, true);
  assert.equal(dia(r, '2026-08-12').pasado, false);
  assert.equal(dia(r, '2026-08-13').pasado, false);
});

test('una fecha inválida no rompe la rejilla ni inventa un día', () => {
  const r = rejillaMes(ANCLA, [clase('no-es-una-fecha'), clase('2026-08-13T10:00:00')], HOY);
  assert.equal(r.filter((d) => d.clases > 0).length, 1);
});

test('el resumen no inventa cifras cuando no hay nada', () => {
  const r = rejillaMes(ANCLA, [
    clase('2026-08-13T10:00:00', 10, 9),
    clase('2026-08-14T10:00:00', 10, 10),
    clase('2026-08-15T10:00:00', 10, 4),
    clase('2026-08-15T12:00:00', 10, 4),
  ], HOY);
  assert.equal(resumenDia(dia(r, '2026-08-20')), 'Sin clases');
  assert.equal(resumenDia(dia(r, '2026-08-13')), '1 clase · 1 plaza libre');
  assert.equal(resumenDia(dia(r, '2026-08-14')), '1 clase · completo');
  assert.equal(resumenDia(dia(r, '2026-08-15')), '2 clases · 12 plazas libres');
});

test('⚠️ la etiqueta de un día lleva el MES, no solo el número', () => {
  // La rejilla enseña días de tres meses distintos: sin el mes, el 5 de agosto
  // y el 5 de septiembre sonaban idénticos para un lector de pantalla. Lo
  // destapó un e2e que chocó con las dos celdas a la vez.
  const r = rejillaMes(ANCLA, [clase('2026-08-13T10:00:00', 10, 9)], HOY);
  assert.equal(etiquetaDia(dia(r, '2026-08-13')), '13 de agosto — 1 clase · 1 plaza libre');
  assert.equal(etiquetaDia(dia(r, '2026-09-05')), '5 de septiembre — Sin clases');
  assert.notEqual(etiquetaDia(dia(r, '2026-08-05')), etiquetaDia(dia(r, '2026-09-05')));
});

test('la etiqueta del mes va en español', () => {
  assert.match(etiquetaMes(ANCLA), /agosto/i);
  assert.match(etiquetaMes(ANCLA), /2026/);
});
