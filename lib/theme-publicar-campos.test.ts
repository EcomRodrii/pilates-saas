import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAMPOS_PUBLICABLES, esFaviconDeBorrador, fusionarCampos } from './theme-publicar-campos.ts';

// Publicar el color o el favicon desde Configuración › Marca. Lo que se fija:
// que solo cambia lo tocado, que nada del borrador sale a lo publicado sin
// pedirlo, y cuándo hay que copiar el archivo del favicon.

const PUBLICADO = { primary: '#343825', secondary: '#5A6142', fontId: 'jakarta', faviconUrl: null as string | null };
const BORRADOR = { primary: '#343825', secondary: '#5A6142', fontId: 'otra-a-medias', faviconUrl: 'https://x.supabase.co/storage/v1/object/public/avatars/favicon-borrador-s1?v=1' as string | null };

test('guardar el color no borra el favicon pendiente del borrador ni publica lo que el borrador tenga a medias', () => {
  const { publicado, borrador } = fusionarCampos(PUBLICADO, BORRADOR, { primary: '#224466', secondary: '#D9C29E' });
  assert.deepEqual(publicado, { ...PUBLICADO, primary: '#224466', secondary: '#D9C29E' });
  assert.equal(publicado.fontId, 'jakarta', 'lo del editor a medias no sale a lo publicado');
  assert.equal(borrador.faviconUrl, BORRADOR.faviconUrl, 'el favicon del borrador sigue ahí');
  assert.equal(borrador.fontId, 'otra-a-medias');
  assert.equal(borrador.primary, '#224466');
});

test('publicar el favicon lo pone en los dos, y quitarlo también', () => {
  const url = 'https://x.supabase.co/storage/v1/object/public/avatars/favicon-s1?v=2';
  const puesto = fusionarCampos(PUBLICADO, BORRADOR, { faviconUrl: url });
  assert.equal(puesto.publicado.faviconUrl, url);
  assert.equal(puesto.borrador.faviconUrl, url);
  assert.equal(puesto.publicado.primary, PUBLICADO.primary);
  const quitado = fusionarCampos(puesto.publicado, puesto.borrador, { faviconUrl: null });
  assert.equal(quitado.publicado.faviconUrl, null);
  assert.equal(quitado.borrador.faviconUrl, null);
});

test('no toca los objetos de entrada', () => {
  const antes = structuredClone(BORRADOR);
  fusionarCampos(PUBLICADO, BORRADOR, { faviconUrl: null });
  assert.deepEqual(BORRADOR, antes);
});

test('solo se copia el archivo del favicon si es el borrador de ESTE estudio', () => {
  assert.equal(esFaviconDeBorrador('https://x.supabase.co/storage/v1/object/public/avatars/favicon-borrador-s1?v=9', 's1'), true);
  assert.equal(esFaviconDeBorrador('https://x.supabase.co/storage/v1/object/public/avatars/favicon-s1?v=9', 's1'), false, 'ya publicado');
  assert.equal(esFaviconDeBorrador('https://x.supabase.co/storage/v1/object/public/avatars/favicon-borrador-s2', 's1'), false, 'de otro estudio');
  assert.equal(esFaviconDeBorrador('https://example.com/mi-favicon.png', 's1'), false, 'un enlace pegado');
  assert.equal(esFaviconDeBorrador('no es una url', 's1'), false);
});

test('Marca solo publica suelto el color y el favicon', () => {
  assert.deepEqual([...CAMPOS_PUBLICABLES], ['primary', 'secondary', 'faviconUrl']);
});
