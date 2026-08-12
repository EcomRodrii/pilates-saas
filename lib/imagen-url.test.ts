import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarUrlImagen, esUrlImagenValida } from './imagen-url.ts';

test('un enlace https normal se acepta y se le quitan los espacios', () => {
  const r = normalizarUrlImagen('  https://cdn.estudio.com/sala.jpg  ');
  assert.deepEqual(r, { url: 'https://cdn.estudio.com/sala.jpg' });
});

test('vacío o en blanco pide un enlace, no revienta', () => {
  for (const nada of ['', '   ', null, undefined]) {
    const r = normalizarUrlImagen(nada);
    assert.ok('error' in r, String(nada));
  }
});

test('http se RECHAZA: el navegador lo bloquea por contenido mixto', () => {
  // Aceptarlo dejaría guardar algo que nunca llega a verse, y sin ningún aviso.
  const r = normalizarUrlImagen('http://estudio.com/sala.jpg');
  assert.ok('error' in r);
  assert.match((r as { error: string }).error, /https:\/\//);
});

test('pegar el dominio sin esquema se explica, no se adivina', () => {
  // El caso real: copiar «www.estudio.com/foto.jpg» de la barra del navegador.
  const r = normalizarUrlImagen('www.estudio.com/foto.jpg');
  assert.ok('error' in r);
});

test('javascript: y file: no pasan aunque `new URL` los parsee', () => {
  // `new URL('javascript:alert(1)')` NO lanza: el filtro tiene que ir sobre el
  // protocolo, no sobre si la cadena es una URL válida.
  for (const malo of ['javascript:alert(1)', 'file:///etc/passwd', 'data:image/svg+xml,<svg/>']) {
    assert.ok('error' in normalizarUrlImagen(malo), malo);
  }
});

test('una ruta relativa no es un enlace', () => {
  assert.ok('error' in normalizarUrlImagen('/por-defecto/estudio-hero.webp'));
});

test('esUrlImagenValida es el mismo criterio, en booleano', () => {
  assert.equal(esUrlImagenValida('https://a.test/b.png'), true);
  assert.equal(esUrlImagenValida('http://a.test/b.png'), false);
  assert.equal(esUrlImagenValida(''), false);
});
