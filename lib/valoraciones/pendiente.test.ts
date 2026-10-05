import { test } from 'node:test';
import assert from 'node:assert/strict';
import { elegirClaseParaValorar } from './pendiente.ts';

const AHORA = Date.parse('2026-10-07T09:00:00Z');
const s = (id: string, fin: string) => ({ id, fin });
const esta = s('ma', '2026-10-07T07:50:00Z');
const ayer = s('ay', '2026-10-06T17:50:00Z');

test('la terminada hace menos de 24 h a la que asistió y sin valorar', () => {
  assert.equal(elegirClaseParaValorar([esta], new Set(['ma']), new Set(), AHORA)?.id, 'ma');
});

test('sin asistencia, o ya valorada, no', () => {
  assert.equal(elegirClaseParaValorar([esta], new Set(), new Set(), AHORA), null);
  assert.equal(elegirClaseParaValorar([esta], new Set(['ma']), new Set(['ma']), AHORA), null);
});

test('a las 24 h justas ya no; un minuto antes, sí', () => {
  assert.equal(elegirClaseParaValorar([esta], new Set(['ma']), new Set(), Date.parse('2026-10-08T07:50:00Z')), null);
  assert.ok(elegirClaseParaValorar([esta], new Set(['ma']), new Set(), Date.parse('2026-10-08T07:49:00Z')));
});

test('una clase que aún no ha terminado no se valora', () => {
  assert.equal(elegirClaseParaValorar([s('x', '2026-10-07T10:00:00Z')], new Set(['x']), new Set(), AHORA), null);
});

test('con dos, la más reciente, aunque llegue la segunda', () => {
  assert.equal(elegirClaseParaValorar([ayer, esta], new Set(['ay', 'ma']), new Set(), AHORA)?.id, 'ma');
  assert.equal(elegirClaseParaValorar([esta, ayer], new Set(['ay', 'ma']), new Set(['ma']), AHORA)?.id, 'ay');
});

test('un fin que no es una fecha no cuenta', () => {
  assert.equal(elegirClaseParaValorar([s('r', 'nada')], new Set(['r']), new Set(), AHORA), null);
});
