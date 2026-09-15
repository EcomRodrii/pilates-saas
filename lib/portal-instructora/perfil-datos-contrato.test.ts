import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// Guardia de contrato de lo que la instructora cambia de su ficha desde la app
// (sus datos y su foto). Van con service-role, así que la RLS no protege nada:
// la ficha tiene que salir del token y cada escritura ir a SU fila de SU
// estudio con solo los campos permitidos. Si falla, se arregla el código, no la
// guardia.
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = join(import.meta.dirname, '..', '..');
const DATOS = readFileSync(join(RAIZ, 'app/api/portal/instructora/perfil/datos/route.ts'), 'utf8');
const FOTO = readFileSync(join(RAIZ, 'app/api/portal/instructora/foto/route.ts'), 'utf8');

const SU_FILA = /\.eq\('id', sesion\.instructorId\)\.eq\('studio_id', sesion\.studioId\)/g;

test('sus datos: la ficha sale del token, y lee y escribe SU fila de SU estudio', () => {
  assert.match(DATOS, /verificarInstructoraEnEstudio\(req, slug\)/);
  assert.equal(DATOS.match(SU_FILA)?.length, 2, 'lectura y escritura filtradas por su id y su estudio');
  // Nunca un id de ficha que venga en la petición.
  assert.doesNotMatch(DATOS, /body\??\.(instructorId|instructor_id|id)\b/);
});

test('sus datos: escribe SOLO lo que devuelve leerCambiosPerfil, nunca el cuerpo', () => {
  assert.match(DATOS, /const lectura = leerCambiosPerfil\(body\?\.cambios\);/);
  assert.match(DATOS, /\.update\(lectura\.cambios\)/);
  assert.equal(DATOS.match(/\.update\(/g)?.length, 1);
  const patch = DATOS.slice(DATOS.indexOf('export async function PATCH'));
  assert.ok(patch.indexOf('verificarInstructoraEnEstudio(') < patch.indexOf('.update('), 'la sesión antes de escribir');
});

test('la foto: el objeto es instructor-<id del token> y nunca uno que venga en la petición', () => {
  assert.match(FOTO, /verificarInstructoraEnEstudio\(req, slug\)/);
  assert.match(FOTO, /`instructor-\$\{sesion\.instructorId\}`/);
  assert.doesNotMatch(FOTO, /searchParams\.get\('(instructorId|id|ruta|path)'\)/);
  assert.equal(FOTO.match(SU_FILA)?.length, 2, 'subir y quitar apuntan en SU fila');
  // Tipo y tamaño validados en el servidor, no solo en el navegador.
  assert.match(FOTO, /TIPOS_FOTO_PERFIL\.includes\(archivo\.type\)/);
  assert.match(FOTO, /archivo\.size > FOTO_PERFIL_MAX_BYTES/);
});

test('quitar la foto: se deja de apuntar ANTES de borrar el fichero', () => {
  const del = FOTO.slice(FOTO.indexOf('export async function DELETE'));
  const apunta = del.indexOf('.update({ foto_url: null })');
  const borra = del.indexOf('.remove(');
  assert.ok(apunta > 0 && borra > apunta);
});
