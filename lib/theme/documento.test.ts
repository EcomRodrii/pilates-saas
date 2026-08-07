import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  desdeArray, aArray, enPapelera, quitar, restaurar, borrarDeVerdad, duplicar, mover, sustituir,
} from './documento.ts';
import type { BloqueHome } from '../portal-home-bloques.ts';

const txt = (id: string, titulo = ''): BloqueHome => ({ id, kind: 'texto', config: { titulo, texto: '' } });
const tres = () => desdeArray([txt('a'), txt('b'), txt('c')]);
/** Ids deterministas: un test que dependa de un contador global es un test frágil. */
function contador(prefijo = 'n') { let i = 0; return () => `${prefijo}${++i}`; }

test('ida y vuelta: array → documento → array es la identidad', () => {
  const original = [txt('a'), txt('b'), txt('c')];
  assert.deepEqual(aArray(desdeArray(original)), original);
});

test('el orden sale del ARRAY de entrada, nunca de las claves del mapa', () => {
  // ⚠️ Con ids numéricos, `Object.keys` los devuelve ordenados como enteros y
  // no en orden de inserción. Si el orden saliera del mapa, este caso lo
  // reordenaría solo.
  const doc = desdeArray([txt('30'), txt('4'), txt('100')]);
  assert.deepEqual(doc.orden, ['30', '4', '100']);
  assert.deepEqual(aArray(doc).map((b) => b.id), ['30', '4', '100']);
});

test('quitar saca del orden pero CONSERVA la configuración — y restaurar la devuelve entera', () => {
  // Es justo lo que un array plano no puede hacer: allí borrar es perder.
  const doc = sustituir(tres(), txt('b', 'Escrito por la propietaria'));
  const sinB = quitar(doc, 'b');
  assert.deepEqual(aArray(sinB).map((b) => b.id), ['a', 'c']);
  assert.deepEqual(enPapelera(sinB).map((b) => b.id), ['b']);

  const vuelta = restaurar(sinB, 'b');
  const b = aArray(vuelta).find((x) => x.id === 'b');
  assert.equal((b as { config: { titulo: string } }).config.titulo, 'Escrito por la propietaria');
});

test('restaurar no duplica si ya está vivo, ni inventa lo que no existe', () => {
  const doc = tres();
  assert.deepEqual(restaurar(doc, 'a').orden, doc.orden);
  assert.deepEqual(restaurar(doc, 'no-existe').orden, doc.orden);
});

test('borrarDeVerdad quita del mapa: ya no se puede restaurar', () => {
  const doc = borrarDeVerdad(tres(), 'b');
  assert.deepEqual(aArray(doc).map((b) => b.id), ['a', 'c']);
  assert.deepEqual(enPapelera(doc), []);
  assert.deepEqual(restaurar(doc, 'b').orden, ['a', 'c']);
});

test('duplicar deja la copia JUSTO detrás del original, con identidad nueva', () => {
  const { doc, id } = duplicar(tres(), 'a', contador());
  assert.equal(id, 'n1');
  assert.deepEqual(doc.orden, ['a', 'n1', 'b', 'c']);
  assert.notEqual(doc.bloques['n1'], doc.bloques['a']);
});

test('duplicar da ids NUEVOS también a los hijos', () => {
  // Si compartieran id con los del original, seleccionar uno en el editor
  // marcaría los dos y editar uno cambiaría el otro.
  const conHijos: BloqueHome = {
    id: 'g', kind: 'contenedor',
    config: { titulo: '', direccion: 'columna', separacion: 'normal', reparto: 'iguales' },
    hijos: [txt('h1'), txt('h2')] as never,
  };
  const { doc, id } = duplicar(desdeArray([conHijos]), 'g', contador());
  const copia = doc.bloques[id!] as { hijos: { id: string }[] };
  assert.deepEqual(copia.hijos.map((h) => h.id), ['n2', 'n3']);
  const orig = doc.bloques['g'] as { hijos: { id: string }[] };
  assert.deepEqual(orig.hijos.map((h) => h.id), ['h1', 'h2'], 'el original no se toca');
});

test('mover acota el destino en vez de perder el bloque', () => {
  assert.deepEqual(mover(tres(), 'a', 99).orden, ['b', 'c', 'a']);
  assert.deepEqual(mover(tres(), 'c', -5).orden, ['c', 'a', 'b']);
  assert.deepEqual(mover(tres(), 'no-existe', 0).orden, ['a', 'b', 'c']);
});

test('un id en el orden sin bloque en el mapa se ignora, no revienta', () => {
  // Dato corrupto o a medio migrar: el portal de la socia no se puede caer
  // por esto (mismo criterio que la lectura tolerante de los bloques).
  const doc = { bloques: { a: txt('a') }, orden: ['a', 'fantasma'] };
  assert.deepEqual(aArray(doc).map((b) => b.id), ['a']);
});

test('sustituir conserva la posición y no crea nada que no estuviera', () => {
  const doc = sustituir(tres(), txt('b', 'nuevo'));
  assert.deepEqual(doc.orden, ['a', 'b', 'c']);
  assert.equal((aArray(doc)[1] as { config: { titulo: string } }).config.titulo, 'nuevo');
  assert.deepEqual(sustituir(tres(), txt('zzz')).bloques['zzz'], undefined);
});
