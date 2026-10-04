import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoriaVistas, personaDeSesionGuardada } from './memoria-vistas.ts';

test('memoria de vistas: lo de una alumna NUNCA se le enseña a otra en el mismo dispositivo', () => {
  const m = new MemoriaVistas();
  assert.equal(m.guardar('alumna:alma:mis-clases', 'ana', 'ana', ['reserva de Ana']), true);
  assert.deepEqual(m.leer('alumna:alma:mis-clases', 'ana'), ['reserva de Ana']);
  assert.equal(m.leer('alumna:alma:mis-clases', 'bea'), undefined);
  assert.equal(m.tiene('alumna:alma:mis-clases', 'bea'), false);
  // Anónima es otra identidad, no «cualquiera».
  assert.equal(m.leer('alumna:alma:mis-clases', null), undefined);
});

test('memoria de vistas: si la persona cambió a media petición, no se guarda', () => {
  const m = new MemoriaVistas();
  assert.equal(m.guardar('alumna:alma:inicio', 'ana', 'bea', { de: 'ana' }), false);
  assert.equal(m.leer('alumna:alma:inicio', 'bea'), undefined);
  assert.equal(m.leer('alumna:alma:inicio', 'ana'), undefined);
  assert.equal(m.guardar('alumna:alma:inicio', 'ana', null, { de: 'ana' }), false);
  assert.equal(m.tamano, 0);
});

test('memoria de vistas: una escritura en un estudio vacía SOLO ese estudio, de todas las personas', () => {
  const m = new MemoriaVistas();
  m.guardar('alumna:alma:inicio', 'ana', 'ana', 1);
  m.guardar('alumna:alma:bonos', 'bea', 'bea', 2);
  m.guardar('instr:alma:agenda:2026-10-04', 'ana', 'ana', 3);
  m.guardar('alumna:almazen:inicio', 'ana', 'ana', 4);
  assert.equal(m.olvidarEstudio('alma'), 3);
  assert.equal(m.leer('alumna:almazen:inicio', 'ana'), 4);
  assert.equal(m.tamano, 1);
  m.olvidarTodo();
  assert.equal(m.tamano, 0);
});

test('personaDeSesionGuardada: el id del usuario de la sesión de auth-js, o nadie', () => {
  assert.equal(personaDeSesionGuardada(JSON.stringify({ access_token: 't', user: { id: 'u-1' } })), 'u-1');
  assert.equal(personaDeSesionGuardada(JSON.stringify({ access_token: 't', user: null })), null);
  assert.equal(personaDeSesionGuardada(JSON.stringify({ user: { id: 7 } })), null);
  assert.equal(personaDeSesionGuardada('no es json'), null);
  assert.equal(personaDeSesionGuardada(null), null);
  assert.equal(personaDeSesionGuardada(''), null);
});
