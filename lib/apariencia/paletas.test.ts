import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PALETAS, PALETAS_CON_DE_SERIE, PALETA_DE_SERIE, colorValido, contrasteDeBotones, paletaDeColor } from './paletas.ts';
import { DEFAULT_THEME } from '../theme-schema.ts';

// Las paletas del color de marca: una lista para Apariencia y para el alta.

test('«De serie» es el color con el que nace el portal, y va la primera en el alta', () => {
  assert.equal(PALETA_DE_SERIE.color, DEFAULT_THEME.primary);
  assert.equal(PALETAS_CON_DE_SERIE[0], PALETA_DE_SERIE);
  assert.deepEqual(PALETAS_CON_DE_SERIE.slice(1), [...PALETAS]);
  assert.deepEqual(PALETAS.map(p => p.nombre), ['Salvia', 'Terracota', 'Lavanda', 'Océano', 'Rosa empolvado', 'Tinta']);
  for (const p of PALETAS_CON_DE_SERIE) assert.ok(colorValido(p.color), p.nombre);
});

test('Apariencia y el alta usan esta lista, no una copia', () => {
  const editor = readFileSync(new URL('../../components/apariencia/editor-apariencia-app.tsx', import.meta.url), 'utf8');
  assert.match(editor, /from '@\/lib\/apariencia\/paletas'/);
  assert.doesNotMatch(editor, /const PALETAS\b/, 'la lista vive en lib/apariencia/paletas.ts');
});

test('se reconoce la paleta de un color sin mirar mayúsculas', () => {
  assert.equal(paletaDeColor('#5e7a5a')?.nombre, 'Salvia');
  assert.equal(paletaDeColor(DEFAULT_THEME.primary.toLowerCase())?.nombre, 'De serie');
  assert.equal(paletaDeColor('#123456'), null);
});

test('el texto de los botones se elige para que se lea, y se dice cuánto', () => {
  const oscuro = contrasteDeBotones('#2E3440')!;
  assert.equal(oscuro.nombre, 'blanco');
  assert.ok(oscuro.seLee);
  assert.match(oscuro.frase, /^Botones con texto blanco · \d+,\d:1 · se lee bien$/);
  const claro = contrasteDeBotones('#F5E6A8')!;
  assert.equal(claro.nombre, 'oscuro', 'un amarillo claro lleva texto oscuro');
  assert.ok(claro.seLee);
  // Un gris medio: el mejor de los dos no llega a 4,5 y se dice.
  const medio = contrasteDeBotones('#777777')!;
  assert.equal(medio.seLee, medio.ratio >= 4.5);
  assert.equal(contrasteDeBotones('#12345'), null);
  assert.equal(contrasteDeBotones('rojo'), null);
});
