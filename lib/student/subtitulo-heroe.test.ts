import { test } from 'node:test';
import assert from 'node:assert/strict';
import { subtituloDelHeroe, SUBTITULO_POR_DEFECTO } from './subtitulo-heroe.ts';

test('si el estudio lo ha escrito, manda el suyo', () => {
  assert.equal(subtituloDelHeroe('Disciplina hoy, resultados mañana.'), 'Disciplina hoy, resultados mañana.');
});

test('sin escribir nada se pinta el del producto, NO un hueco', () => {
  // Es lo que separa este campo de los otros tres textos de marca: aquí ya
  // había texto antes de ser configurable, así que vacío no puede dejar el
  // héroe sin esa línea.
  assert.equal(subtituloDelHeroe(null), SUBTITULO_POR_DEFECTO);
  assert.equal(subtituloDelHeroe(undefined), SUBTITULO_POR_DEFECTO);
});

test('una cadena en blanco es «no ha escrito nada», no una línea vacía', () => {
  // Un estudio que lo borra y guarda: el formulario manda '' antes de que el
  // servidor lo convierta a NULL, y en ese hueco no puede quedar el héroe con
  // una línea en blanco.
  assert.equal(subtituloDelHeroe(''), SUBTITULO_POR_DEFECTO);
  assert.equal(subtituloDelHeroe('   '), SUBTITULO_POR_DEFECTO);
  assert.equal(subtituloDelHeroe('\n\t '), SUBTITULO_POR_DEFECTO);
});

test('se recortan los espacios de los lados', () => {
  assert.equal(subtituloDelHeroe('  Muévete hoy  '), 'Muévete hoy');
});
