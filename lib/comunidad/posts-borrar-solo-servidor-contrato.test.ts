import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// Guardia de contrato: borrar una publicación del tablón es solo del servidor,
// que borra también su foto del bucket público (migr
// 20261005150400_posts_comunidad_borrar_y_foto_solo_servidor). El efecto en la
// base de datos lo prueba `supabase/tests/rls-posts-comunidad-solo-servidor.test.ts`.
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = join(import.meta.dirname, '..', '..');
const DIR = join(RAIZ, 'supabase', 'migrations');
const sinComentarios = (s: string) => s.replace(/--.*$/gm, '');
const migraciones = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
const migracion = migraciones.find((f) => /drop policy if exists posts_comunidad_borrar on public\.posts_comunidad/.test(sinComentarios(readFileSync(join(DIR, f), 'utf8'))));
const SQL = migracion ? sinComentarios(readFileSync(join(DIR, migracion), 'utf8')) : '';
const DATOS = readFileSync(join(RAIZ, 'lib/supabase-data.ts'), 'utf8');

/** Las columnas del GRANT UPDATE por columnas de la migración. */
function columnasConcedidas(): string[] {
  const m = SQL.match(/grant update \(([^)]*)\)\s+on table public\.posts_comunidad to authenticated/);
  assert.ok(m, 'la migración no concede UPDATE por columnas en posts_comunidad');
  return m![1].split(',').map((c) => c.trim());
}

test('la migración quita el DELETE y el UPDATE de tabla, y nunca concede imagen_url ni autor_id', () => {
  assert.ok(migracion, 'no se encuentra la migración que cierra el borrado de posts al navegador');
  assert.match(SQL, /revoke delete on table public\.posts_comunidad from authenticated/);
  assert.match(SQL, /revoke update on table public\.posts_comunidad from authenticated/);
  // El REVOKE de tabla va ANTES del GRANT por columnas (un REVOKE de columna no resta de un GRANT de tabla).
  assert.ok(SQL.indexOf('revoke update on table public.posts_comunidad') < SQL.indexOf('grant update ('));
  const concedidas = columnasConcedidas();
  for (const c of ['imagen_url', 'autor_id', 'studio_id', 'id']) assert.ok(!concedidas.includes(c), `${c} no se escribe desde el navegador`);
  assert.match(SQL, /has_column_privilege\('authenticated', 'public\.posts_comunidad', 'imagen_url', 'UPDATE'\)/);
});

test('lo que escribe dbUpdatePostComunidad está todo concedido (si no, editar fallaría en producción)', () => {
  const ini = DATOS.indexOf('export async function dbUpdatePostComunidad');
  const cuerpo = DATOS.slice(ini, DATOS.indexOf('\n}\n', ini));
  const escritas = [...cuerpo.matchAll(/db\.(\w+) = /g)].map((m) => m[1]);
  assert.ok(escritas.length >= 5, 'el parser no ve las columnas de dbUpdatePostComunidad');
  const concedidas = columnasConcedidas();
  const sinConceder = escritas.filter((c) => !concedidas.includes(c));
  assert.deepEqual(sinConceder, [], 'columna que el panel escribe y la migración no concede: añádela al GRANT o llévala al servidor');
});

test('ninguna migración posterior devuelve al navegador el DELETE de posts ni la columna de la foto', () => {
  assert.ok(migracion);
  for (const f of migraciones.filter((x) => x > migracion!)) {
    const sql = sinComentarios(readFileSync(join(DIR, f), 'utf8'));
    assert.doesNotMatch(sql, /grant\s+[^;]*\b(delete|all)\b[^;]*on\s+(table\s+)?(public\.)?posts_comunidad\b[^;]*to\s+[^;]*\b(authenticated|anon|public)\b/i,
      `${f} devuelve al navegador el borrado de publicaciones`);
    assert.doesNotMatch(sql, /grant\s+update\s*\([^)]*\bimagen_url\b[^)]*\)\s+on\s+(table\s+)?(public\.)?posts_comunidad/i,
      `${f} deja al navegador reescribir la foto de una publicación`);
    assert.doesNotMatch(sql, /create\s+policy\s+\S+\s+on\s+(public\.)?posts_comunidad\s+[^;]*for\s+(delete|all)\b/i,
      `${f} crea una política de borrado de publicaciones`);
  }
});

test('el panel borra por la ruta de servidor, nunca por PostgREST', () => {
  assert.doesNotMatch(DATOS, /from\(\s*['"]posts_comunidad['"]\s*\)\s*\.\s*delete\s*\(/, 'lib/supabase-data.ts borra posts por PostgREST');
  const ini = DATOS.indexOf('export async function dbDeletePostComunidad');
  const cuerpo = DATOS.slice(ini, DATOS.indexOf('\n}\n', ini));
  assert.match(cuerpo, /fetch\(`\/api\/comunidad\/posts\/\$\{encodeURIComponent\(id\)\}`/);
  assert.match(cuerpo, /method: 'DELETE'/);
  assert.match(cuerpo, /res\.status === 204/, 'solo un 204 cuenta como borrado');
});

test('la ruta comprueba quién borra, borra la foto ANTES que la fila y acota todo al estudio', () => {
  const ruta = readFileSync(join(RAIZ, 'app/api/comunidad/posts/[id]/route.ts'), 'utf8');
  assert.match(ruta, /verificarSesionStaff\(req\)/);
  assert.match(ruta, /post\.autor_id !== sesion\.userId && !puedeModerarComunidad\(sesion\.rol\)/);
  const foto = ruta.indexOf('.remove([ruta])');
  const fila = ruta.indexOf('.delete()');
  assert.ok(foto > 0 && fila > foto, 'la foto se borra antes que la fila');
  assert.ok((ruta.match(/\.eq\('studio_id', sesion\.studioId\)/g) ?? []).length >= 3, 'lectura, recuento y borrado acotados al estudio');
  assert.match(ruta, /rutaFotoComunidad\(imagenUrl, sesion\.studioId,/);
  // Y al crear, solo se acepta una foto de SU estudio: si no, borrar el post borraría la de otro.
  assert.match(readFileSync(join(RAIZ, 'app/api/comunidad/posts/route.ts'), 'utf8'), /rutaFotoComunidad\(imagenUrlRaw, sesion\.studioId,/);
});
