import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Una reseña de Network es irrevocable y única por relación (no hay edición). El
// resto de escrituras de Network con el nombre del estudio (vacantes,
// candidaturas, formalización, verificaciones) exigen `puedeGestionarEquipo`; esta
// solo pedía sesión de staff, así que cualquier rol del panel podía publicar la
// reseña del estudio.
//
// Es un test sobre el texto de la ruta (mismo recurso que otros tests de
// `app/api/`): el handler necesita Supabase y una sesión, que `node --test` no monta.
const ruta = readFileSync(new URL('../../app/api/network/resenas/route.ts', import.meta.url), 'utf8');

function cuerpoDe(metodo: 'GET' | 'POST'): string {
  const i = ruta.indexOf(`export async function ${metodo}(`);
  assert.ok(i >= 0, `no se encontró ${metodo}`);
  const siguiente = ruta.indexOf('\nexport async function ', i + 1);
  return ruta.slice(i, siguiente === -1 ? undefined : siguiente);
}

test('publicar una reseña exige poder gestionar el equipo, y se comprueba antes de escribir', () => {
  const post = cuerpoDe('POST');
  const comprobacion = post.indexOf('puedeGestionarEquipo(sesion.rol)');
  const escritura = post.indexOf(".from('red_resenas').insert(");
  assert.ok(comprobacion >= 0, 'POST no comprueba el rol: cualquier rol de staff podría reseñar.');
  assert.ok(escritura >= 0, 'no se encontró la escritura de la reseña');
  assert.ok(comprobacion < escritura, 'el rol se comprueba DESPUÉS de escribir, o no se comprueba antes.');
  assert.match(post, /status: 403/, 'un rol sin permiso tiene que recibir 403.');
});
