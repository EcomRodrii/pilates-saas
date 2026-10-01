import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clasesPorCelda, claveCelda, diasConClases, filasDeFranjas, textoHueco } from './franjas.ts';
import { escalaDia, minutoDeY, textoTramoPlegado, yDeMinuto } from './escala-dia.ts';

const h = (hh: number, mm = 0) => hh * 60 + mm;

test('una fila por hora en la que empieza alguna clase; lo de en medio, plegado', () => {
  const filas = filasDeFranjas([
    { inicioMin: h(8) }, { inicioMin: h(9) }, { inicioMin: h(9, 15) }, { inicioMin: h(10, 30) },
    { inicioMin: h(11) }, { inicioMin: h(18) }, { inicioMin: h(19, 45) },
  ]);
  assert.deepEqual(filas, [
    { tipo: 'hora', hora: 8 }, { tipo: 'hora', hora: 9 }, { tipo: 'hora', hora: 10 }, { tipo: 'hora', hora: 11 },
    { tipo: 'hueco', desde: 12, hasta: 18 },
    { tipo: 'hora', hora: 18 }, { tipo: 'hora', hora: 19 },
  ]);
  assert.equal(textoHueco({ desde: 12, hasta: 18 }), '12:00 – 18:00 · ningún día hay clases a estas horas');
  assert.deepEqual(filasDeFranjas([]), []);
});

test('cada clase va en la casilla de su día y de la hora en que empieza, por hora y sala', () => {
  const celdas = clasesPorCelda([
    { id: 'b', dia: 0, inicioMin: h(9, 15), orden: 0 },
    { id: 'a', dia: 0, inicioMin: h(9), orden: 1 },
    { id: 'c', dia: 0, inicioMin: h(9), orden: 0 },
    { id: 'd', dia: 3, inicioMin: h(18), orden: 0 },
  ]);
  assert.deepEqual(celdas.get(claveCelda(0, 9)), ['c', 'a', 'b']);
  assert.deepEqual(celdas.get(claveCelda(3, 18)), ['d']);
  assert.equal(celdas.get(claveCelda(1, 9)), undefined);
});

test('los días sin clases se marcan para dibujarlos estrechos', () => {
  assert.deepEqual(diasConClases([{ dia: 0 }, { dia: 2 }, { dia: 2 }]), [true, false, true, false, false, false, false]);
});

test('la escala del día pliega las horas muertas y deja el resto a su tamaño', () => {
  const e = escalaDia(
    [{ inicioMin: h(8), finMin: h(8, 50) }, { inicioMin: h(10, 30), finMin: h(11, 20) }, { inicioMin: h(18), finMin: h(18, 50) }],
    { aperturaMin: h(8), cierreMin: h(21), pxPorHora: 60, altoPlegado: 30 },
  );
  // 08–12 visible (la hora vacía de las 9 no llega a dos horas), 12–18 plegado,
  // 18–19 visible y 19–21 plegado: lo que queda hasta el cierre también es un hueco.
  assert.deepEqual(e.tramos.map(t => [t.desdeMin / 60, t.hastaMin / 60, t.plegado]), [[8, 12, false], [12, 18, true], [18, 19, false], [19, 21, true]]);
  assert.equal(e.alto, 4 * 60 + 30 + 60 + 30);
  assert.equal(yDeMinuto(e, h(10, 30)), 150);
  assert.equal(yDeMinuto(e, h(18)), 270);
  // Las rayas de hora no se pintan dentro de la banda plegada.
  assert.deepEqual(e.horas.map(x => x.min / 60), [8, 9, 10, 11, 18]);
  assert.equal(textoTramoPlegado(e.tramos[1]), '12:00 – 18:00 · sin clases');
});

test('de píxeles a minutos y vuelta, y la banda plegada no es un sitio donde soltar', () => {
  const e = escalaDia([{ inicioMin: h(9), finMin: h(10) }, { inicioMin: h(18), finMin: h(19) }], { aperturaMin: h(9), cierreMin: h(19), pxPorHora: 60, altoPlegado: 30 });
  for (const min of [h(9), h(9, 30), h(18, 15)]) assert.equal(minutoDeY(e, yDeMinuto(e, min)), min);
  assert.equal(minutoDeY(e, 75), null); // dentro de la banda 10–18
  assert.equal(minutoDeY(e, 10_000), null);
});

test('un día sin clases enseña el horario entero, sin plegar nada', () => {
  const e = escalaDia([], { aperturaMin: h(8), cierreMin: h(14), pxPorHora: 60 });
  assert.deepEqual(e.tramos.map(t => [t.desdeMin / 60, t.hastaMin / 60, t.plegado]), [[8, 14, false]]);
});

test('una clase antes de la apertura ensancha la rejilla en vez de cortarse', () => {
  const e = escalaDia([{ inicioMin: h(7), finMin: h(7, 50) }, { inicioMin: h(9), finMin: h(10) }], { aperturaMin: h(8), cierreMin: h(10), pxPorHora: 60 });
  assert.equal(e.desdeMin, h(7));
  assert.equal(yDeMinuto(e, h(7)), 0);
});
