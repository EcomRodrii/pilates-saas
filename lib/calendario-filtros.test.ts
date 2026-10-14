import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  claseAtenuadaPorInstructor, claseAtenuadaPorColumna, instructoraApagada, alternarInstructora, alternarEnConjunto,
  SIN_FILTROS_COLUMNA, type FiltrosColumna,
} from './calendario-filtros.ts';

test('sin filtro activo, nada se atenúa', () => {
  assert.equal(claseAtenuadaPorInstructor('i1', ''), false);
  assert.equal(claseAtenuadaPorInstructor(null, ''), false);
});

test('con filtro activo, la clase de la instructora elegida no se atenúa', () => {
  assert.equal(claseAtenuadaPorInstructor('i1', 'i1'), false);
});

test('con filtro activo, la clase de otra instructora se atenúa', () => {
  assert.equal(claseAtenuadaPorInstructor('i2', 'i1'), true);
});

test('con filtro activo, una clase sin instructora también se atenúa (no es la elegida)', () => {
  assert.equal(claseAtenuadaPorInstructor(null, 'i1'), true);
});

const f = (o: Partial<FiltrosColumna> = {}): FiltrosColumna => ({ ...SIN_FILTROS_COLUMNA, ...o });

test('columna: sin nada apagado no atenúa ninguna clase', () => {
  assert.equal(claseAtenuadaPorColumna({ tipoClaseId: 't1', instructorId: 'i1', apuntadas: 0 }, f()), false);
});

test('columna: atenúa la clase de un tipo o de una instructora con el ojo cerrado', () => {
  assert.equal(claseAtenuadaPorColumna({ tipoClaseId: 't1', instructorId: 'i1', apuntadas: 3 }, f({ tiposApagados: new Set(['t1']) })), true);
  assert.equal(claseAtenuadaPorColumna({ tipoClaseId: 't1', instructorId: 'i1', apuntadas: 3 }, f({ instructorasApagadas: new Set(['i1']) })), true);
  assert.equal(claseAtenuadaPorColumna({ tipoClaseId: 't2', instructorId: 'i2', apuntadas: 3 }, f({ tiposApagados: new Set(['t1']), instructorasApagadas: new Set(['i1']) })), false);
});

test('columna: una clase sin instructora no se atenúa por los ojos de las instructoras', () => {
  assert.equal(claseAtenuadaPorColumna({ tipoClaseId: 't1', instructorId: null, apuntadas: 1 }, f({ instructorasApagadas: new Set(['i1']) })), false);
});

test('columna: «solo con alumnas apuntadas» atenúa las vacías y nada más', () => {
  assert.equal(claseAtenuadaPorColumna({ tipoClaseId: 't1', instructorId: 'i1', apuntadas: 0 }, f({ soloConApuntadas: true })), true);
  assert.equal(claseAtenuadaPorColumna({ tipoClaseId: 't1', instructorId: 'i1', apuntadas: 1 }, f({ soloConApuntadas: true })), false);
});

test('columna: con el desplegable puesto, en la columna solo esa instructora tiene el ojo abierto', () => {
  assert.equal(instructoraApagada('i1', 'i1', new Set()), false);
  assert.equal(instructoraApagada('i2', 'i1', new Set()), true);
  assert.equal(instructoraApagada('i2', '', new Set(['i2'])), true);
  assert.equal(instructoraApagada('i1', '', new Set(['i2'])), false);
});

test('columna: tocar un ojo con el desplegable puesto pasa lo que se veía a la columna y vacía el desplegable', () => {
  const r = alternarInstructora('i2', ['i1', 'i2', 'i3'], 'i1', new Set());
  assert.equal(r.filtroInstructorId, '');
  assert.deepEqual([...r.apagadas].sort(), ['i3']);
});

test('columna: sin desplegable, tocar un ojo lo abre o lo cierra', () => {
  assert.deepEqual([...alternarInstructora('i2', ['i1', 'i2'], '', new Set()).apagadas], ['i2']);
  assert.deepEqual([...alternarInstructora('i2', ['i1', 'i2'], '', new Set(['i2'])).apagadas], []);
  assert.deepEqual([...alternarEnConjunto(new Set(['a']), 'b')].sort(), ['a', 'b']);
  assert.deepEqual([...alternarEnConjunto(new Set(['a']), 'a')], []);
});
