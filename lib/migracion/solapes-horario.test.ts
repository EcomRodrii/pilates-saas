import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectarSolapes, textoConflicto, type ClasePendiente, type ClaseExistente } from './solapes-horario.ts';

const h = (hhmm: string) => `2026-10-12T${hhmm}:00.000Z`;
const p = (fila: number, ini: string, fin: string, sala: string | null, ins: string | null, clase = 'Reformer'): ClasePendiente =>
  ({ fila, clase, salaId: sala, instructorId: ins, inicio: h(ini), fin: h(fin) });
const e = (ini: string, fin: string, sala: string | null, ins: string | null, cancelada = false): ClaseExistente =>
  ({ salaId: sala, instructorId: ins, inicio: h(ini), fin: h(fin), cancelada });

test('sin solapes: pasan todas, en el mismo orden', () => {
  const r = detectarSolapes([p(1, '08:00', '08:55', 's1', 'i1'), p(2, '09:00', '09:55', 's1', 'i1')], []);
  assert.equal(r.validas.length, 2);
  assert.equal(r.conflictos.length, 0);
});

test('dos clases en la misma sala a la vez: la segunda del archivo es la que se avisa', () => {
  const r = detectarSolapes([p(1, '08:00', '08:55', 's1', 'i1'), p(2, '08:30', '09:25', 's1', 'i2')], []);
  assert.deepEqual(r.validas.map(x => x.fila), [1]);
  assert.equal(r.conflictos.length, 1);
  assert.deepEqual(r.conflictos[0], { fila: 2, clase: 'Reformer', inicio: h('08:30'), recurso: 'sala', recursoId: 's1', contra: { tipo: 'fila', fila: 1 } });
});

test('la misma instructora en dos salas a la vez también se pisa', () => {
  const r = detectarSolapes([p(1, '08:00', '08:55', 's1', 'i1'), p(2, '08:00', '08:55', 's2', 'i1')], []);
  assert.equal(r.validas.length, 1);
  assert.equal(r.conflictos[0].recurso, 'instructora');
});

test('clases consecutivas (una acaba cuando empieza la otra) NO chocan: rango semiabierto', () => {
  const r = detectarSolapes([p(1, '08:00', '09:00', 's1', 'i1'), p(2, '09:00', '10:00', 's1', 'i1')], []);
  assert.equal(r.conflictos.length, 0);
});

test('choca con una clase que ya existe, aunque empiece antes que ninguna del archivo', () => {
  const r = detectarSolapes([p(1, '10:30', '11:25', 's1', 'i1')], [e('10:00', '10:55', 's1', 'i9')]);
  assert.equal(r.validas.length, 0);
  assert.deepEqual(r.conflictos[0].contra, { tipo: 'existente' });
});

test('una clase existente CANCELADA no bloquea', () => {
  const r = detectarSolapes([p(1, '10:30', '11:25', 's1', 'i1')], [e('10:00', '10:55', 's1', 'i1', true)]);
  assert.equal(r.validas.length, 1);
});

test('sin sala o sin instructora no hay con qué chocar', () => {
  const r = detectarSolapes([p(1, '08:00', '08:55', null, null), p(2, '08:00', '08:55', null, null)], []);
  assert.equal(r.validas.length, 2);
});

test('una fila que se pisa en sala E instructora genera dos avisos pero una sola omisión', () => {
  const r = detectarSolapes([p(1, '08:00', '08:55', 's1', 'i1'), p(2, '08:00', '08:55', 's1', 'i1')], []);
  assert.equal(r.validas.length, 1);
  assert.equal(r.conflictos.length, 2);
  assert.deepEqual(new Set(r.conflictos.map(c => c.fila)), new Set([2]));
});

test('una fila omitida no bloquea a las siguientes (no ocupa hueco)', () => {
  const r = detectarSolapes([
    p(1, '08:00', '08:55', 's1', 'i1'),
    p(2, '08:30', '09:25', 's1', 'i2'), // se pisa con la 1 y se omite
    p(3, '09:00', '09:55', 's1', 'i2'), // cabría si la 2 no existiera
  ], []);
  assert.deepEqual(r.validas.map(x => x.fila), [1, 3]);
});

test('textoConflicto dice fila, clase, cuándo, quién y con qué', () => {
  const t = textoConflicto(
    { fila: 12, clase: 'Mat', inicio: h('08:00'), recurso: 'sala', recursoId: 's1', contra: { tipo: 'fila', fila: 3 } },
    { sala: () => 'Sala Mat' }, () => 'lun 12 oct 08:00',
  );
  assert.equal(t, 'Fila 12 · Mat · lun 12 oct 08:00: la sala Sala Mat ya está ocupada a esa hora (la fila 3 del archivo).');
});
