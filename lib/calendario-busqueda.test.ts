import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buscarSesiones, type SesionBuscable } from './calendario-busqueda.ts';

const AHORA = new Date('2026-08-05T12:00:00Z');

function s(over: Partial<SesionBuscable> = {}): SesionBuscable {
  return {
    id: '1', inicio: '2026-08-05T12:00:00Z', cancelada: false,
    tipoClaseNombre: 'Reformer', salaNombre: 'Sala 1', instructorNombre: 'Marta Sanz',
    ...over,
  };
}

test('texto vacío no devuelve nada', () => {
  assert.deepEqual(buscarSesiones([s()], '', AHORA), []);
  assert.deepEqual(buscarSesiones([s()], '   ', AHORA), []);
});

test('encuentra por tipo de clase (case-insensitive)', () => {
  const r = buscarSesiones([s({ id: 'a' })], 'REFOR', AHORA);
  assert.equal(r.length, 1);
  assert.equal(r[0].id, 'a');
});

test('encuentra por sala', () => {
  const r = buscarSesiones([s({ salaNombre: 'Sala Reformer Grande' })], 'reformer grande', AHORA);
  assert.equal(r.length, 1);
});

test('encuentra por instructora', () => {
  const r = buscarSesiones([s({ instructorNombre: 'Laura Gómez' })], 'laura', AHORA);
  assert.equal(r.length, 1);
});

test('excluye canceladas aunque coincida el texto', () => {
  const r = buscarSesiones([s({ cancelada: true })], 'reformer', AHORA);
  assert.deepEqual(r, []);
});

test('sin coincidencia, lista vacía', () => {
  const r = buscarSesiones([s()], 'pilates clínico', AHORA);
  assert.deepEqual(r, []);
});

test('ordena por cercanía a "ahora", no por orden de entrada', () => {
  const lejos = s({ id: 'lejos', inicio: '2026-08-01T12:00:00Z' });
  const cerca = s({ id: 'cerca', inicio: '2026-08-05T13:00:00Z' });
  const r = buscarSesiones([lejos, cerca], 'reformer', AHORA);
  assert.deepEqual(r.map(x => x.id), ['cerca', 'lejos']);
});

test('respeta el límite', () => {
  const candidatas = Array.from({ length: 10 }, (_, i) => s({ id: `s${i}`, inicio: `2026-08-0${(i % 9) + 1}T12:00:00Z` }));
  const r = buscarSesiones(candidatas, 'reformer', AHORA, 3);
  assert.equal(r.length, 3);
});
