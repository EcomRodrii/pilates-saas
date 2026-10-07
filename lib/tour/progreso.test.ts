import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAPITULOS, TODOS_LOS_PASOS } from './capitulos.ts';
import {
  PROGRESO_VACIO, abrirCapitulo, cerrarPaso, empezar, estadoVisita, parseProgreso, pasoAnteriorA, pasoCerrado, verCapitulo,
  type ProgresoVisita,
} from './progreso.ts';

const todo = () => true;

test('un progreso corrupto vuelve a empezar, nunca arranca a mitad', () => {
  for (const malo of [null, undefined, '', '  ', '{}', 'no json', '[]', 0, 1, true, { v: 2 }, { v: 1, hechos: 'c1.1' }, []]) {
    const p = parseProgreso(malo);
    assert.equal(p.inicio, false, `con ${JSON.stringify(malo)} no debe estar iniciado`);
    assert.deepEqual(p.hechos, []);
  }
});

test('parseProgreso descarta pasos y capítulos que ya no existen y los duplicados', () => {
  const p = parseProgreso({ v: 1, inicio: true, hechos: ['c1.1', 'c1.1', 'c99.9', 7, null], aplazados: ['c6.5', 'zzz'], vistos: ['c1', 'c0'] });
  assert.deepEqual(p.hechos, ['c1.1']);
  assert.deepEqual(p.aplazados, ['c6.5']);
  assert.deepEqual(p.vistos, ['c1']);
});

test('ida y vuelta: lo que se guarda es lo que se lee', () => {
  let p = empezar(PROGRESO_VACIO);
  p = cerrarPaso(p, 'c1.1', 'hecho');
  p = cerrarPaso(p, 'c6.5', 'aplazado');
  p = verCapitulo(p, 'c1');
  assert.deepEqual(parseProgreso(JSON.parse(JSON.stringify(p))), p);
});

test('empieza por la bienvenida, y luego por el primer paso', () => {
  assert.equal(estadoVisita(PROGRESO_VACIO, todo).fase, 'inicio');
  const e = estadoVisita(empezar(PROGRESO_VACIO), todo);
  assert.equal(e.fase, 'paso');
  if (e.fase === 'paso') { assert.equal(e.paso.id, 'c1.1'); assert.equal(e.numero, 1); assert.equal(e.de, 3); }
});

test('al cerrar el último paso de un capítulo sale su pantalla, UNA vez, y luego el siguiente capítulo', () => {
  let p = empezar(PROGRESO_VACIO);
  for (const s of CAPITULOS[0].pasos) p = cerrarPaso(p, s.id, 'hecho');
  let e = estadoVisita(p, todo);
  assert.equal(e.fase, 'capitulo');
  p = verCapitulo(p, 'c1');
  // Cada capítulo nuevo se abre con su «para qué sirve» antes de su primer paso.
  e = estadoVisita(p, todo);
  assert.equal(e.fase, 'apertura');
  if (e.fase === 'apertura') { assert.equal(e.capitulo.id, 'c2'); assert.equal(e.numero, 2); }
  p = abrirCapitulo(p, 'c2');
  e = estadoVisita(p, todo);
  assert.equal(e.fase, 'paso');
  if (e.fase === 'paso') assert.equal(e.paso.id, 'c2.1');
});

test('el primer capítulo no se abre dos veces: la bienvenida ya lo explica', () => {
  const e = estadoVisita(empezar(PROGRESO_VACIO), todo);
  assert.equal(e.fase, 'paso');
});

test('un progreso guardado antes de las aperturas no reabre los capítulos ya empezados', () => {
  const viejo = parseProgreso({ v: 1, inicio: true, hechos: ['c1.1', 'c1.2', 'c1.3', 'c2.1'], aplazados: [], vistos: ['c1'] });
  assert.ok(viejo.abiertos.includes('c1') && viejo.abiertos.includes('c2'));
  const e = estadoVisita(viejo, todo);
  assert.equal(e.fase, 'paso');
  if (e.fase === 'paso') assert.equal(e.paso.id, 'c2.2');
});

test('cerrar un paso dos veces, o uno que no existe, no cambia nada', () => {
  const p = cerrarPaso(empezar(PROGRESO_VACIO), 'c1.1', 'hecho');
  assert.equal(cerrarPaso(p, 'c1.1', 'hecho'), p);
  assert.equal(cerrarPaso(p, 'c1.1', 'aplazado'), p);
  assert.equal(cerrarPaso(p, 'nada', 'hecho'), p);
});

test('un paso aplazado cuenta como cerrado: no atrapa a nadie', () => {
  const p = cerrarPaso(empezar(PROGRESO_VACIO), 'c6.5', 'aplazado');
  assert.equal(pasoCerrado(p, 'c6.5'), true);
});

test('un capítulo sin ningún paso aplicable se salta sin pantalla', () => {
  const sinC1 = (s: { id: string }) => !s.id.startsWith('c1.');
  const e = estadoVisita(empezar(PROGRESO_VACIO), sinC1);
  assert.equal(e.fase, 'apertura');
  if (e.fase === 'apertura') assert.equal(e.capitulo.id, 'c2');
});

test('con todo cerrado y visto, la visita termina', () => {
  let p: ProgresoVisita = empezar(PROGRESO_VACIO);
  for (const s of TODOS_LOS_PASOS) p = cerrarPaso(p, s.id, 'hecho');
  for (const c of CAPITULOS) p = verCapitulo(p, c.id);
  assert.equal(estadoVisita(p, todo).fase, 'fin');
});

test('pasoAnteriorA devuelve el paso cerrado de justo antes', () => {
  let p = empezar(PROGRESO_VACIO);
  p = cerrarPaso(p, 'c1.1', 'hecho');
  p = cerrarPaso(p, 'c1.2', 'hecho');
  assert.equal(pasoAnteriorA(p, 'c1.3', todo)?.id, 'c1.2');
  assert.equal(pasoAnteriorA(p, 'c1.1', todo), null);
});
