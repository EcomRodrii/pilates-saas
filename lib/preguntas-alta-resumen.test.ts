import { test } from 'node:test';
import assert from 'node:assert/strict';
import { celdaSegura, csvRespuestas, filasRespuestas, resumenPreguntas, textoRespuesta } from './preguntas-alta-resumen.ts';
import type { PreguntaAlta } from './preguntas-alta.ts';

const p = (id: string, tipo: PreguntaAlta['tipo'], requerido = false, opciones: string[] = []): PreguntaAlta =>
  ({ id, etiqueta: id, tipo, opciones, requerido });

const OBJ = p('objetivo', 'seleccion', true, ['Fuerza', 'Flexibilidad']);
const PRACT = p('practico', 'booleano', true);
const NOTA = p('nota', 'numero');
const COMO = p('como', 'texto');
const PREGUNTAS = [OBJ, PRACT, NOTA, COMO];

const SOCIAS = [
  { id: 'a', nombre: 'Ana', apellidos: 'Gil', camposExtra: { objetivo: 'Fuerza', practico: false, nota: 8, como: null } },
  { id: 'b', nombre: 'Bea', apellidos: 'Ruiz', camposExtra: { objetivo: 'Fuerza', practico: true, nota: '6,5' } },
  { id: 'c', nombre: 'Carla', apellidos: '', camposExtra: {} },
  { id: 'd', nombre: 'Dani', apellidos: 'Sol', camposExtra: null },
  // Una opción que el estudio ya quitó.
  { id: 'e', nombre: 'Eva', apellidos: 'Paz', camposExtra: { objetivo: 'Rehabilitación', practico: true, nota: 7, como: 'Instagram' } },
];

test('cada fila dice lo que le falta con la misma regla que la app', () => {
  const f = filasRespuestas(PREGUNTAS, SOCIAS);
  assert.deepEqual(f.map((x) => [x.id, x.pendientes, x.contestadas]), [
    ['a', 0, 3], // «No» y 8 cuentan; la opcional en blanco ya está preguntada.
    ['b', 1, 3], // «como» nunca se le preguntó.
    ['c', 4, 0],
    ['d', 4, 0],
    ['e', 0, 4],
  ]);
  assert.equal(f[2].nombre, 'Carla');
});

test('el resumen reparte las opciones, cuenta «Otras» y hace la media de los números', () => {
  const r = resumenPreguntas(PREGUNTAS, filasRespuestas(PREGUNTAS, SOCIAS));
  const por = Object.fromEntries(r.map((x) => [x.id, x]));
  assert.deepEqual(por.objetivo.reparto, [{ opcion: 'Fuerza', n: 2 }, { opcion: 'Flexibilidad', n: 0 }, { opcion: 'Otras', n: 1 }]);
  assert.equal(por.objetivo.contestadas, 3);
  assert.deepEqual(por.practico.reparto, [{ opcion: 'Sí', n: 2 }, { opcion: 'No', n: 1 }]);
  assert.deepEqual(por.nota.numeros, { media: 7.2, min: 6.5, max: 8 });
  assert.equal(por.como.contestadas, 1);
  assert.equal(por.como.reparto, undefined);
});

test('las respuestas se leen en castellano', () => {
  assert.equal(textoRespuesta(PRACT, true), 'Sí');
  assert.equal(textoRespuesta(PRACT, false), 'No');
  assert.equal(textoRespuesta(NOTA, 6.5), '6,5');
  assert.equal(textoRespuesta(p('f', 'fecha'), '2026-03-12'), '12/03/2026');
  for (const nada of [null, undefined, '', '  ']) assert.equal(textoRespuesta(COMO, nada), '—');
});

test('el CSV no deja que Excel ejecute lo que escribió una alumna', () => {
  for (const peligro of ['=HYPERLINK("x")', '+1', '-2+3', '@SUM(A1)', '\tx']) {
    assert.ok(celdaSegura(peligro).replace(/^"/, '').startsWith("'"), peligro);
  }
  assert.equal(celdaSegura('Hola'), 'Hola');
  assert.equal(celdaSegura('a;b'), '"a;b"');
  assert.equal(celdaSegura('dijo "hola"'), '"dijo ""hola"""');
});

test('el CSV lleva nombre, respuestas y estado, sin email ni teléfono', () => {
  const csv = csvRespuestas(PREGUNTAS, filasRespuestas(PREGUNTAS, SOCIAS.slice(0, 2)));
  const [cab, ana, bea] = csv.split('\r\n');
  assert.equal(cab, 'Alumna;objetivo;practico;nota;como;Estado');
  assert.equal(ana, 'Ana Gil;Fuerza;No;8;—;Completa');
  assert.equal(bea, 'Bea Ruiz;Fuerza;Sí;6,5;—;Le falta 1');
});
