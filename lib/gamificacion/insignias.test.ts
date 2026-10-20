import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  CREDITO_ICONOS, INSIGNIA_DE_FORMA, INSIGNIAS, RUTA_INSIGNIAS, esClaveInsignia, insigniaDeNivel, insigniaOPorDefecto, resolverInsignia,
} from './insignias.ts';

const RAIZ = join(import.meta.dirname, '../..');

test('cada insignia del catálogo tiene su imagen en public/gamificacion', () => {
  for (const [clave, { archivo }] of Object.entries(INSIGNIAS)) {
    assert.ok(existsSync(join(RAIZ, 'public', RUTA_INSIGNIAS, archivo)), `falta la imagen de «${clave}»: ${archivo}`);
  }
});

test('una clave del catálogo se resuelve a su imagen', () => {
  assert.deepEqual(resolverInsignia('trofeo'), { clave: 'trofeo', nombre: 'Trofeo', src: '/gamificacion/trophy.png' });
});

test('los emojis de las plantillas antiguas se leen como su insignia, con o sin selector de variación', () => {
  assert.equal(resolverInsignia('🥇')?.clave, 'trofeo');
  assert.equal(resolverInsignia('🎖️')?.clave, 'medalla');
  assert.equal(resolverInsignia('🎖')?.clave, 'medalla');
  assert.equal(resolverInsignia(' 🔥 ')?.clave, 'racha');
  assert.equal(resolverInsignia('🎁')?.clave, 'regalo');
});

test('otro texto no es insignia: se pinta tal cual', () => {
  assert.equal(resolverInsignia('2'), null);
  assert.equal(resolverInsignia('🧘'), null);
  assert.equal(resolverInsignia(''), null);
  assert.equal(resolverInsignia(null), null);
  // Un nombre de propiedad heredada no es una clave del catálogo.
  assert.equal(esClaveInsignia('toString'), false);
  assert.equal(resolverInsignia('constructor'), null);
});

test('un nivel sin insignia elegida: estrella, y corona el último', () => {
  assert.equal(insigniaDeNivel('1', false).clave, 'estrella');
  assert.equal(insigniaDeNivel('5', true).clave, 'corona');
  assert.equal(insigniaDeNivel('medalla', true).clave, 'medalla');
});

test('cada forma de ganar créditos apunta a una insignia que existe', () => {
  for (const clave of Object.values(INSIGNIA_DE_FORMA)) assert.ok(esClaveInsignia(clave), clave);
});

test('el crédito de la licencia gratuita enlaza a icons8.com', () => {
  assert.equal(CREDITO_ICONOS.url, 'https://icons8.com');
});

test('un emoji tecleado a mano cae a la insignia de su tipo', () => {
  assert.equal(insigniaOPorDefecto('🧘', 'objetivo').clave, 'objetivo');
  assert.equal(insigniaOPorDefecto('🥇', 'objetivo').clave, 'trofeo');
});
