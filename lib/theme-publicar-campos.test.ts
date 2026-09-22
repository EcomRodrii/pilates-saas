import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAMPOS_PUBLICABLES, esFaviconDeBorrador, fusionarCampos, siguienteVersionTheme, soloLoEnviado } from './theme-publicar-campos.ts';
import { themeDraftSchema } from './theme-schema.ts';

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

test('publicar los colores no manda también un favicon vacío: los valores por defecto de zod no se cuelan', () => {
  const esquema = themeDraftSchema.pick({ primary: true, secondary: true, faviconUrl: true }).strict();
  const colores = { primary: '#224466', secondary: '#D9C29E' };
  // La premisa: zod 4 SÍ rellena el favicon aunque no venga.
  assert.equal(esquema.parse(colores).faviconUrl, null);
  assert.deepEqual(soloLoEnviado(colores, esquema.parse(colores)), colores);
  assert.deepEqual(soloLoEnviado({ faviconUrl: null }, esquema.parse({ faviconUrl: null })), { faviconUrl: null },
    'quitarlo a propósito sí viaja');
  assert.deepEqual(soloLoEnviado({}, esquema.parse({})), {}, 'un cuerpo vacío se queda vacío (y el route responde 400)');
  assert.deepEqual(soloLoEnviado(null, { primary: '#224466' }), {});
  const borrador = soloLoEnviado({ seoTitulo: 'Hola' }, themeDraftSchema.parse({ seoTitulo: 'Hola' }));
  assert.deepEqual(borrador, { seoTitulo: 'Hola' }, 'un borrador parcial no devuelve a fábrica lo que no trae');
});

test('la versión que se escribe supera siempre a la leída, aunque el reloj vaya por detrás', () => {
  const leida = '2026-09-15T10:00:00.500+00:00';
  assert.equal(siguienteVersionTheme(leida, Date.parse('2026-09-15T10:00:05.000Z')), '2026-09-15T10:00:05.000Z');
  assert.equal(siguienteVersionTheme(leida, Date.parse('2026-09-15T09:00:00.000Z')), '2026-09-15T10:00:00.501Z', 'reloj atrasado');
  assert.equal(siguienteVersionTheme(leida, Date.parse(leida)), '2026-09-15T10:00:00.501Z', 'el mismo milisegundo');
  assert.equal(siguienteVersionTheme('2026-09-15T10:00:00.500999+00:00', 0), '2026-09-15T10:00:00.501Z', 'microsegundos de Postgres');
  assert.equal(siguienteVersionTheme(null, 1000), new Date(1000).toISOString(), 'fila sin versión');
  assert.equal(siguienteVersionTheme('basura', 1000), new Date(1000).toISOString());
});

test('se publica suelto el color, el favicon y la apariencia de la app', () => {
  assert.deepEqual([...CAMPOS_PUBLICABLES], ['primary', 'secondary', 'faviconUrl', 'appAlumna']);
});
