import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MENSAJE_MUESTRA, NOMBRE_MUESTRA, SLUG_MUESTRA, esSlugDeMuestra, estudioDeMuestra, limpiarNombreMuestra, mensajeMuestra,
  nombreDeMensajeMuestra,
} from './muestra.ts';
import { imagenDeEstudio } from '../imagenes-por-defecto.ts';
import { DEFAULT_THEME } from '../theme-schema.ts';
import { normalizarSlug } from '../slug.ts';
import { resolverApariencia } from './apariencia.ts';

// La app de muestra del paso 1 del alta nueva (lib/student/muestra.ts): la app de
// la alumna de un estudio que aún no existe, tal como nacerá. Nada inventado.

test('el producto nunca da a un estudio la dirección de la muestra', () => {
  assert.notEqual(normalizarSlug(SLUG_MUESTRA), SLUG_MUESTRA);
  assert.equal(/^[a-z0-9-]+$/.test(SLUG_MUESTRA), false);
  assert.equal(esSlugDeMuestra(SLUG_MUESTRA), true);
  assert.equal(esSlugDeMuestra('estudio-alba'), false);
});

test('el estudio de muestra es el que nacerá: su nombre, sin logo ni ciudad, el color y la portada de serie', () => {
  const e = estudioDeMuestra('Estudio Alba Pilates', DEFAULT_THEME.primary);
  assert.equal(e.nombre, 'Estudio Alba Pilates');
  assert.equal(e.slug, SLUG_MUESTRA, 'las rutas de la app siguen en la muestra');
  assert.equal(e.logoUrl, null, 'sin logo: el monograma con sus iniciales');
  assert.equal(e.iconoMarcaUrl, null);
  assert.equal(e.ciudad, '', 'la ciudad la pone el paso 3');
  assert.equal(e.tituloAcceso, null, 'el titular de serie de la pantalla de entrada');
  assert.equal(e.colorPrimario, DEFAULT_THEME.primary);
  assert.deepEqual(e.apariencia, resolverApariencia(null));
  // La foto de serie que le tocará: la elige el portal con SU dirección de semilla.
  assert.equal(e.fotoPortada, imagenDeEstudio('portada', null, 'estudio-alba-pilates'));
  assert.equal(e.paginaOculta, false);
});

test('el módulo no carga el esquema del tema: lo lee también el navegador', async () => {
  const { readFile } = await import('node:fs/promises');
  const fuente = await readFile(new URL('./muestra.ts', import.meta.url), 'utf8');
  assert.equal(/from '[^']*theme-schema/.test(fuente), false, 'theme-schema (zod) acabaría en el JavaScript de la app de la alumna');
});

test('sin nombre todavía, «Tu estudio»', () => {
  assert.equal(estudioDeMuestra('', DEFAULT_THEME.primary).nombre, NOMBRE_MUESTRA);
  assert.equal(estudioDeMuestra('   ', DEFAULT_THEME.primary).nombre, NOMBRE_MUESTRA);
  assert.equal(estudioDeMuestra(null, DEFAULT_THEME.primary).nombre, NOMBRE_MUESTRA);
});

test('el nombre que llega de otra ventana: texto de una línea y con tope', () => {
  assert.equal(limpiarNombreMuestra('  Estudio\n\tAlba  '), 'Estudio Alba');
  assert.equal(limpiarNombreMuestra(42), '');
  assert.equal(limpiarNombreMuestra('x'.repeat(200)).length, 80);
});

test('solo vale el mensaje de la ventana que la enmarca y de nuestro origen', () => {
  const padre = {};
  const propio = { origin: 'https://www.tentare.app', padre };
  const bueno = { origin: propio.origin, source: padre, data: mensajeMuestra('Estudio Alba') };
  assert.equal(nombreDeMensajeMuestra(bueno, propio), 'Estudio Alba');
  assert.equal(nombreDeMensajeMuestra({ ...bueno, origin: 'https://otro.example' }, propio), null, 'otro origen');
  assert.equal(nombreDeMensajeMuestra({ ...bueno, source: {} }, propio), null, 'otra ventana');
  assert.equal(nombreDeMensajeMuestra({ ...bueno, data: { tipo: 'otro', nombre: 'X' } }, propio), null, 'otro mensaje');
  assert.equal(nombreDeMensajeMuestra({ ...bueno, data: 'Estudio Alba' }, propio), null);
  assert.equal(nombreDeMensajeMuestra({ ...bueno, data: { tipo: MENSAJE_MUESTRA, nombre: ' Alba\n' } }, propio), 'Alba');
});
