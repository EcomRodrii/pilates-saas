import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// `leerBonosPorCaducar` vive en el cron (que importa con `@/`, así que no se
// carga en `node --test`): se comprueba sobre el texto. La comparten el aviso
// del cron y la herramienta del asistente.
const src = readFileSync(new URL('./bonos-inactivas-cron.ts', import.meta.url), 'utf8');
const cuerpo = src.slice(src.indexOf('export async function leerBonosPorCaducar('), src.indexOf('async function bonos('));

test('leerBonosPorCaducar va acotada al estudio, paginada y lanza si falla', () => {
  assert.ok(cuerpo.length > 0);
  assert.match(cuerpo, /\.eq\('studio_id', studioId\)/);
  assert.match(cuerpo, /fetchAllRows</);
  assert.match(cuerpo, /\.range\(from, to\)/);
  assert.match(cuerpo, /exigir\(subsR\.error/);
  assert.match(cuerpo, /\.gte\('fecha_fin', tramo\.desde\)\.lte\('fecha_fin', tramo\.hasta\)/);
});

test('el cron sigue avisando de los bonos de los próximos 7 días con la función compartida', () => {
  assert.match(src, /leerBonosPorCaducar\(admin, studioId, \{ desde: hoy, hasta: en7 \}\)/);
});
