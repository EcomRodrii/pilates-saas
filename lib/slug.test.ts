import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarSlug, motivoSlugInvalido, SLUG_MAX } from './slug.ts';

// La dirección pública se generaba al crear el estudio y no se podía tocar
// nunca más: quien se rebautizaba se quedaba con la vieja para siempre.

test('normaliza lo que escribe una persona, no la corrige a gritos', () => {
  // "Pilates Málaga" no es un error: es el nombre de su estudio.
  assert.equal(normalizarSlug('Pilates Málaga'), 'pilates-malaga');
  assert.equal(normalizarSlug('  Estudio   Núñez  '), 'estudio-nunez');
  assert.equal(normalizarSlug('Ñandú & Co.'), 'nandu-co');
});

test('no deja guiones sueltos en los extremos ni repetidos', () => {
  assert.equal(normalizarSlug('---hola---'), 'hola');
  assert.equal(normalizarSlug('a  ---  b'), 'a-b');
});

test('una dirección normal vale', () => {
  assert.equal(motivoSlugInvalido('pilates-malaga'), null);
  assert.equal(motivoSlugInvalido('estudio2'), null);
});

test('el motivo dice qué arreglar, no solo que está mal', () => {
  // Un "dirección no válida" no le dice a nadie qué cambiar.
  assert.match(motivoSlugInvalido('ab') ?? '', /al menos 3/);
  assert.match(motivoSlugInvalido('') ?? '', /Escribe/);
  assert.match(motivoSlugInvalido('a'.repeat(SLUG_MAX + 1)) ?? '', /no puede pasar/);
});

test('no se pueden coger palabras de la propia aplicación', () => {
  // Si un estudio cogiera «portal», su página chocaría con la del producto y
  // ganaría la del producto: tendría un portal que no lleva a ningún sitio.
  for (const r of ['api', 'portal', 'reservar', 'configuracion', 'interno']) {
    assert.notEqual(motivoSlugInvalido(r), null, r);
  }
});

test('lo ya normalizado pasa la validación: las dos reglas encajan', () => {
  // La pantalla normaliza mientras se escribe y el servidor valida al guardar.
  // Si no encajaran, la dueña vería algo válido y el servidor lo rechazaría.
  for (const escrito of ['Pilates Málaga', 'Estudio Núñez', 'CENTRO 2']) {
    assert.equal(motivoSlugInvalido(normalizarSlug(escrito)), null, escrito);
  }
});

test('lo que se normaliza a nada se explica, no se acepta en silencio', () => {
  assert.equal(normalizarSlug('¿¿¿!!!'), '');
  assert.match(motivoSlugInvalido(normalizarSlug('¿¿¿!!!')) ?? '', /Escribe/);
});
