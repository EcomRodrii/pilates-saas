import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agruparAlumnas, normalizarBusqueda } from './alumnas-vista.ts';

const alumna = (nombre: string, proxima: { fecha: string; hora: string } | null = null) => ({ nombre, proxima });

test('primero las que tienen clase próxima, por fecha y hora; después las demás, por nombre', () => {
  const { conProxima, sinProxima } = agruparAlumnas([
    alumna('Zoe R.'),
    alumna('Laura M.', { fecha: '2026-09-18', hora: '10:00' }),
    alumna('Aina P.', { fecha: '2026-09-17', hora: '19:00' }),
    alumna('Carmen L.'),
    alumna('Beatriz S.', { fecha: '2026-09-17', hora: '09:00' }),
  ]);
  assert.deepEqual(conProxima.map((a) => a.nombre), ['Beatriz S.', 'Aina P.', 'Laura M.']);
  assert.deepEqual(sinProxima.map((a) => a.nombre), ['Carmen L.', 'Zoe R.']);
});

test('el buscador ignora mayúsculas y acentos', () => {
  assert.equal(normalizarBusqueda('  Inés Núñez '), 'ines nunez');
  const { conProxima, sinProxima } = agruparAlumnas([alumna('Inés G.'), alumna('Laura M.', { fecha: '2026-09-18', hora: '10:00' })], 'INES');
  assert.deepEqual(sinProxima.map((a) => a.nombre), ['Inés G.']);
  assert.equal(conProxima.length, 0);
});

test('sin coincidencias, los dos grupos quedan vacíos; sin filtro, no se pierde ninguna', () => {
  const lista = [alumna('Aina P.'), alumna('Carmen L.', { fecha: '2026-09-20', hora: '08:00' })];
  const nada = agruparAlumnas(lista, 'xyz');
  assert.equal(nada.conProxima.length + nada.sinProxima.length, 0);
  const todo = agruparAlumnas(lista, '   ');
  assert.equal(todo.conProxima.length + todo.sinProxima.length, 2);
});
