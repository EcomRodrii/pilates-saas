import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mensajeParaLaApp } from './mensaje-destacado.ts';
import { miWebNuevaPara } from '../estudio/mi-web-nueva.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('sin texto no hay franja: ni null, ni vacío, ni solo espacios', () => {
  assert.equal(mensajeParaLaApp(null), null);
  assert.equal(mensajeParaLaApp(undefined), null);
  assert.equal(mensajeParaLaApp(''), null);
  assert.equal(mensajeParaLaApp('  \n '), null);
});

test('con texto, el texto sin espacios de sobra a los lados', () => {
  assert.equal(mensajeParaLaApp('  Cerramos el 1 de noviembre. \n'), 'Cerramos el 1 de noviembre.');
  // Los saltos de línea de dentro se quedan: la franja los respeta.
  assert.equal(mensajeParaLaApp('Línea uno\nLínea dos'), 'Línea uno\nLínea dos');
});

test('la app solo pinta el mensaje del estudio con MI_WEB_NUEVA: el mismo formato que el resto de interruptores', () => {
  assert.equal(miWebNuevaPara('studio-1', {}), false, 'apagado de serie');
  assert.equal(miWebNuevaPara('studio-1', { MI_WEB_NUEVA: 'on' }), true);
  assert.equal(miWebNuevaPara('studio-1', { MI_WEB_NUEVA: 'estudios:studio-2,studio-1' }), true);
  assert.equal(miWebNuevaPara('studio-3', { MI_WEB_NUEVA: 'estudios:studio-2,studio-1' }), false);
});

test('el payload público manda el mensaje solo tras el punto de corte del servidor, y ya limpio', () => {
  const fuente = readFileSync(join(import.meta.dirname, '../db/supabase-data-admin.ts'), 'utf8');
  assert.match(fuente, /mensajeDestacado: miWebNuevaPara\(studioId, process\.env\)\s*\?\s*mensajeParaLaApp\(/);
});
