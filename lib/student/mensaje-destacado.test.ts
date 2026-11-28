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

test('la app pinta el mensaje del estudio con MI_WEB_NUEVA, activado de serie y apagable con off', () => {
  assert.equal(miWebNuevaPara('studio-1', {}), true, 'activado de serie');
  assert.equal(miWebNuevaPara('studio-1', { MI_WEB_NUEVA: 'off' }), false, 'apagado de emergencia');
  assert.equal(miWebNuevaPara('studio-1', { MI_WEB_NUEVA: 'on' }), true);
});

test('el payload público manda el mensaje solo tras el punto de corte del servidor, y ya limpio', () => {
  const fuente = readFileSync(join(import.meta.dirname, '../db/supabase-data-admin.ts'), 'utf8');
  assert.match(fuente, /mensajeDestacado: miWebNuevaPara\(studioId, process\.env\)\s*\?\s*mensajeParaLaApp\(/);
});
