import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  OBJETIVOS, esObjetivo, resolverObjetivos, etiquetaObjetivo,
  claseSirvePara, cuantasPorObjetivo,
} from './objetivos.ts';

test('los ids son ÚNICOS: son la clave que se guarda en BD', () => {
  const ids = OBJETIVOS.map((o) => o.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('un id desconocido no se cuela como objetivo', () => {
  assert.equal(esObjetivo('fuerza'), true);
  assert.equal(esObjetivo('tonificar'), false);
  assert.equal(esObjetivo(''), false);
  assert.equal(esObjetivo(null), false);
  assert.equal(esObjetivo(3), false);
});

test('lo guardado se limpia: fuera desconocidos y duplicados', () => {
  // Un objetivo de una versión anterior de la lista no puede recomendar nada, y
  // dejarlo pasar haría que un tipo de clase pareciera cubrir algo que no cubre.
  assert.deepEqual(resolverObjetivos(['fuerza', 'inventado', 'fuerza']), ['fuerza']);
  assert.deepEqual(resolverObjetivos(null), []);
  assert.deepEqual(resolverObjetivos('fuerza'), []);
  assert.deepEqual(resolverObjetivos([]), []);
});

test('se devuelven en el orden del catálogo, no en el de guardado', () => {
  // Así dos tipos de clase con los mismos objetivos se leen igual en pantalla.
  assert.deepEqual(
    resolverObjetivos(['avanzado', 'empezar']),
    resolverObjetivos(['empezar', 'avanzado']),
  );
  assert.deepEqual(resolverObjetivos(['avanzado', 'empezar']), ['empezar', 'avanzado']);
});

test('sin objetivo elegido, TODAS las clases valen', () => {
  // El asistente puede saltarse ese paso, y entonces no debe filtrar nada.
  assert.equal(claseSirvePara({ objetivos: ['fuerza'] }, ''), true);
});

test('⚠️ una clase SIN objetivos marcados vale para todo', () => {
  // La decisión que más cambia el resultado. El estudio medio va a tardar en
  // rellenar esto; si una clase sin marcar quedara fuera, activar el asistente
  // vaciaría el horario el primer día.
  assert.equal(claseSirvePara({ objetivos: [] }, 'fuerza'), true);
  assert.equal(claseSirvePara({ objetivos: null }, 'fuerza'), true);
  assert.equal(claseSirvePara({}, 'fuerza'), true);
  // Y una con objetivos SOLO vale para los suyos.
  assert.equal(claseSirvePara({ objetivos: ['movilidad'] }, 'fuerza'), false);
  assert.equal(claseSirvePara({ objetivos: ['movilidad', 'fuerza'] }, 'fuerza'), true);
});

test('un objetivo obsoleto guardado no encierra a la clase', () => {
  // Si sus únicos objetivos ya no existen, `resolverObjetivos` la deja vacía y
  // vuelve a valer para todo — mejor eso que desaparecer del horario.
  assert.equal(claseSirvePara({ objetivos: ['ya-no-existe'] }, 'fuerza'), true);
});

test('el recuento por objetivo cuenta también las que no han declarado nada', () => {
  const clases = [
    { objetivos: ['fuerza'] },
    { objetivos: ['movilidad'] },
    { objetivos: [] },        // sin marcar: cuenta en todos
  ];
  const c = cuantasPorObjetivo(clases);
  assert.equal(c.fuerza, 2);
  assert.equal(c.movilidad, 2);
  assert.equal(c.empezar, 1);
  // Todos los objetivos del catálogo aparecen, aunque sea a 0 más 1.
  assert.equal(Object.keys(c).length, OBJETIVOS.length);
});

test('la etiqueta cae al id si alguna vez se pinta uno desconocido', () => {
  assert.equal(etiquetaObjetivo('fuerza'), 'Mejorar fuerza');
  assert.equal(etiquetaObjetivo('raro'), 'raro');
});
