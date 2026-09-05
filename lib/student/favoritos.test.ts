import { test } from 'node:test';
import assert from 'node:assert/strict';
import { proyectarClases, proyectarFavoritos } from './mapeo.ts';

const base = {
  sesiones: [
    { id: 's1', inicio: '2026-09-10T10:00:00', fin: '2026-09-10T10:50:00', aforoMaximo: 8, tipoClaseId: 'tc-reformer', salaId: 'sala-1', instructorId: 'i1', cancelada: false, precioPuntual: null },
    { id: 's2', inicio: '2026-09-10T11:00:00', fin: '2026-09-10T11:50:00', aforoMaximo: 8, tipoClaseId: 'tc-mat', salaId: 'sala-1', instructorId: 'i1', cancelada: false, precioPuntual: null },
  ],
  tiposClase: [{ id: 'tc-reformer', nombre: 'Reformer' }, { id: 'tc-mat', nombre: 'Mat' }],
  salas: [{ id: 'sala-1', nombre: 'Sala 1' }],
  instructores: [{ id: 'i1', nombre: 'Ana' }],
};

test('sin sesión no hay favoritos', () => {
  assert.equal(proyectarFavoritos({ ...base, socia: null }).size, 0);
  assert.equal(proyectarFavoritos({ ...base }).size, 0);
});

test('los favoritos son tipos de clase, tal como los guarda favoritos_clase', () => {
  const f = proyectarFavoritos({ ...base, socia: { favoritos: [{ tipoClaseId: 'tc-reformer' }] } });
  assert.deepEqual([...f], ['tc-reformer']);
});

test('cada clase del horario sabe su tipo, para poder filtrar por favoritas', () => {
  const clases = proyectarClases(base);
  const f = proyectarFavoritos({ ...base, socia: { favoritos: [{ tipoClaseId: 'tc-reformer' }] } });
  const favoritas = clases.filter((c) => f.has(c.tipoClaseId));
  assert.deepEqual(favoritas.map((c) => c.nombre), ['Reformer']);
});
