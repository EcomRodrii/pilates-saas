import test from 'node:test';
import assert from 'node:assert/strict';
import { claveDeImagenPortal, claveSubidaDeCampo } from './storage-clave.ts';

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

// ── claveSubidaDeCampo ──────────────────────────────────────────────────────
// El bug que estos tests impiden: las cuatro fotos de una galería comparten
// `campoId` (`url`). Si la clave no lleva el índice, las cuatro se guardan con
// el mismo nombre y cada subida BORRA la anterior — sin aviso y sin vuelta
// atrás, porque el fichero ya está sobrescrito en Storage.

test('dos elementos de la MISMA lista nunca comparten clave', () => {
  const a = claveSubidaDeCampo('bloque1', 'imagenes', 0);
  const b = claveSubidaDeCampo('bloque1', 'imagenes', 1);
  assert.notEqual(a, b);
});

test('el mismo campo en dos BLOQUES distintos tampoco comparte clave', () => {
  assert.notEqual(
    claveSubidaDeCampo('banner-A', 'imagenUrl'),
    claveSubidaDeCampo('banner-B', 'imagenUrl'),
  );
});

test('sin índice no se inventa ninguno: un campo suelto no es el elemento 0 de nada', () => {
  assert.equal(claveSubidaDeCampo('b1', 'foto'), 'b1-foto');
  assert.equal(claveSubidaDeCampo('b1', 'foto', 0), 'b1-foto-0');
  assert.notEqual(claveSubidaDeCampo('b1', 'foto'), claveSubidaDeCampo('b1', 'foto', 0));
});

test('sin prefijo sigue dando una clave utilizable, no `undefined-…`', () => {
  const k = claveSubidaDeCampo(undefined, 'foto');
  assert.ok(!k.includes('undefined'), `"${k}" mete undefined en el nombre del fichero`);
});

test('lo que sale de aquí sobrevive a la higienización', () => {
  // Las dos funciones se usan en cadena: componer y luego limpiar. Si al
  // componer se colara un carácter que la limpieza borra, dos claves distintas
  // podrían acabar siendo el MISMO fichero.
  const a = claveDeImagenPortal(claveSubidaDeCampo('bloque-abc', 'imagenes', 0));
  const b = claveDeImagenPortal(claveSubidaDeCampo('bloque-abc', 'imagenes', 1));
  assert.notEqual(a, b);
  assert.equal(a, 'bloque-abc-imagenes-0');
});

test('con un id de bloque LARGO el índice sobrevive al recorte', () => {
  // Sin reservarle sitio, el `slice(0, 60)` se comía el `-0`/`-1` del final y
  // las fotos de la galería volvían a colisionar — el mismo bug, más difícil
  // de ver porque solo aparece con ids largos.
  const largo = 'bloque-' + 'x'.repeat(80);
  const a = claveDeImagenPortal(claveSubidaDeCampo(largo, 'imagenes', 0));
  const b = claveDeImagenPortal(claveSubidaDeCampo(largo, 'imagenes', 1));
  assert.notEqual(a, b, 'dos fotos de la misma galería acabarían en el mismo fichero');
  assert.ok(a.endsWith('-0'));
  assert.ok(b.endsWith('-1'));
  assert.ok(a.length <= 60);
});

test('un índice de dos cifras también sobrevive', () => {
  const largo = 'bloque-' + 'x'.repeat(80);
  const a = claveDeImagenPortal(claveSubidaDeCampo(largo, 'imagenes', 9));
  const b = claveDeImagenPortal(claveSubidaDeCampo(largo, 'imagenes', 10));
  assert.notEqual(a, b);
  assert.ok(b.endsWith('-10'));
});
