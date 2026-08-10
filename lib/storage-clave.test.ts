import test from 'node:test';
import assert from 'node:assert/strict';
import { claveDeImagenPortal } from './storage-clave.ts';

// La clave la compone el editor a partir del id de un bloque y del id de un
// campo, y acaba dentro del nombre del fichero en Storage. Es la única
// defensa entre esos dos ids y el path.

test('una clave normal pasa tal cual', () => {
  assert.equal(claveDeImagenPortal('bloque-abc123-imagenUrl'), 'bloque-abc123-imagenUrl');
});

test('no se puede salir de la carpeta con barras ni con ..', () => {
  // Los puntos también caen: `.` no está en la lista de lo permitido, así que
  // de `../../` no queda ni rastro. Es más de lo que hace falta, y está bien
  // que así sea — un id de bloque no tiene puntos.
  assert.equal(claveDeImagenPortal('../../otro-estudio/logo'), 'otro-estudiologo');
  assert.equal(claveDeImagenPortal('a/b'), 'ab');
  assert.ok(!claveDeImagenPortal('..').includes('.'), 'no puede quedar ningún punto');
  // Lo que importa: pase lo que pase, no queda ningún separador de ruta.
  for (const sucia of ['../x', 'a/../b', '..%2Fx', 'a\\b', './x']) {
    const r = claveDeImagenPortal(sucia);
    assert.ok(!r.includes('/'), `"${sucia}" dejó una barra`);
    assert.ok(!r.includes('\\'), `"${sucia}" dejó una contrabarra`);
  }
});

test('se van los espacios, los acentos y todo lo que no sea seguro', () => {
  assert.equal(claveDeImagenPortal('foto de la año 2026'), 'fotodelaao2026');
  assert.equal(claveDeImagenPortal('a b?c=1&d#e'), 'abc1de');
});

test('una clave que se queda en nada devuelve cadena vacía, no algo a medias', () => {
  // El llamador corta con esto: escribir en `portal-{id}-` machacaría un path
  // compartido por todas las claves inválidas del mismo estudio.
  assert.equal(claveDeImagenPortal('///'), '');
  assert.equal(claveDeImagenPortal('   '), '');
  assert.equal(claveDeImagenPortal(''), '');
});

test('se acota el largo: un id enorme no puede reventar el path', () => {
  assert.equal(claveDeImagenPortal('a'.repeat(500)).length, 60);
});
