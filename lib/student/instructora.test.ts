import { test } from 'node:test';
import assert from 'node:assert/strict';
import { notaTexto, proximasClasesDe } from './instructora.ts';

const clases = [
  { id: 'c-ayer', fecha: '2026-09-03', hora: '10:00', instructoraId: 'i1', plazasLibres: 2 },
  { id: 'c-hoy-tarde', fecha: '2026-09-04', hora: '18:00', instructoraId: 'i1', plazasLibres: 0 },
  { id: 'c-hoy-manana', fecha: '2026-09-04', hora: '09:00', instructoraId: 'i1', plazasLibres: 4 },
  { id: 'c-otra', fecha: '2026-09-05', hora: '09:00', instructoraId: 'i2', plazasLibres: 4 },
  { id: 'c-lejos', fecha: '2026-09-20', hora: '09:00', instructoraId: 'i1', plazasLibres: 4 },
];

test('solo las suyas, de hoy en adelante, en orden cronológico', () => {
  assert.deepEqual(proximasClasesDe(clases, 'i1', '2026-09-04').map((c) => c.id), ['c-hoy-manana', 'c-hoy-tarde', 'c-lejos']);
});

test('las de hoy que ya han empezado no son próximas', () => {
  assert.deepEqual(proximasClasesDe(clases, 'i1', '2026-09-04', '12:30').map((c) => c.id), ['c-hoy-tarde', 'c-lejos']);
  // Una que empieza justo ahora sigue contando.
  assert.deepEqual(proximasClasesDe(clases, 'i1', '2026-09-04', '18:00').map((c) => c.id), ['c-hoy-tarde', 'c-lejos']);
});

test('tope de clases', () => {
  assert.deepEqual(proximasClasesDe(clases, 'i1', '2026-09-04', '00:00', 1).map((c) => c.id), ['c-hoy-manana']);
});

test('sin clases futuras → vacío (la hoja lo dice, no lo esconde)', () => {
  assert.deepEqual(proximasClasesDe(clases, 'i1', '2026-10-01'), []);
});

test('la nota se escribe con coma y con su número de votos', () => {
  assert.equal(notaTexto(4.75, 23), '4,8 · 23 valoraciones');
  assert.equal(notaTexto(5, 1), '5,0 · 1 valoración');
  assert.equal(notaTexto(4.2, undefined), '4,2');
  assert.equal(notaTexto(undefined, 40), null);
});
