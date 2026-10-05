import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { esPublicacionDeGrupo, filtrarComentariosParaSocia, nombreEnElTablon } from './comentarios-reglas.ts';

const RAIZ = join(import.meta.dirname, '..', '..');
const leer = (r: string) => readFileSync(join(RAIZ, r), 'utf8');

test('nombre en el tablón: nombre e inicial del primer apellido, lo mismo que la migración', () => {
  // Los mismos casos se pasaron por la migración 20261005150500 en una base local
  // y dieron exactamente esto: si cambia una regla, cambia la otra.
  const casos: [string | null, string | null, string, string][] = [
    ['Lucía', 'Martínez Gómez', 'Lucía M.', 'LM'],
    ['María José', '  ruiz', 'María José R.', 'MR'],
    ['Ana', null, 'Ana', 'A'],
    ['', ' Ortega', 'O.', 'O'],
    [null, null, 'Clienta', 'C'],
  ];
  for (const [nombre, apellidos, esperado, inicial] of casos) {
    assert.deepEqual(nombreEnElTablon({ nombre, apellidos }), { nombre: esperado, inicial }, `${nombre} ${apellidos}`);
  }
  const sql = leer('supabase/migrations/20261005150500_comentarios_nombre_corto.sql');
  assert.match(sql, /split_part\(btrim\(coalesce\(s\.apellidos, ''\)\), ' ', 1\)/, 'el primer apellido');
  assert.match(sql, /then 'Clienta'/);
  assert.match(sql, /where cc\.socio_id is not null/, 'solo las filas de una alumna');
});

test('publicación para un grupo: cualquier audiencia que no sea «Todas»', () => {
  assert.equal(esPublicacionDeGrupo('TODAS'), false);
  assert.equal(esPublicacionDeGrupo(null), false);
  assert.equal(esPublicacionDeGrupo('BONO'), true);
  assert.equal(esPublicacionDeGrupo('ETIQUETA:embarazadas'), true);
});

const fila = (id: string, socio_id: string | null, autor_id: string | null, oculto_en: string | null = null) =>
  ({ id, socio_id, autor_id, oculto_en });
const FILAS = [
  fila('estudio', null, 'auth-duena'),
  fila('mio', 'yo', 'auth-yo'),
  fila('mio-retirado', 'yo', 'auth-yo', '2026-10-05T10:00:00Z'),
  fila('otra', 'otra', 'auth-otra'),
  fila('otra-retirado', 'otra', 'auth-otra', '2026-10-05T10:00:00Z'),
  fila('bloqueada', 'mala', 'auth-mala'),
];
const yo = { socioId: 'yo', authUserId: 'auth-yo' };
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

test('qué comentarios ve: lo retirado solo quien lo escribió, y nada de alguien bloqueado', () => {
  const r = filtrarComentariosParaSocia(FILAS, { ...yo, audiencia: 'TODAS', bloqueadas: new Set(['mala']) });
  assert.deepEqual(ids(r), ['estudio', 'mio', 'mio-retirado', 'otra']);
  assert.deepEqual(r.filter((x) => x.esMio).map((x) => x.id), ['mio', 'mio-retirado']);
});

test('en una publicación para un grupo, solo lo suyo y lo del estudio', () => {
  const r = filtrarComentariosParaSocia(FILAS, { ...yo, audiencia: 'BONO', bloqueadas: new Set() });
  assert.deepEqual(ids(r), ['estudio', 'mio', 'mio-retirado']);
});

// ── Las rutas: quién es sale del token, y nunca se escribe sin comprobar ────

test('las rutas de la alumna sobre un comentario: token, su ficha en ESTE estudio, nunca el body', () => {
  for (const ruta of [
    'app/api/public/comunidad/comentarios/[id]/route.ts',
    'app/api/public/comunidad/comentarios/[id]/denunciar/route.ts',
    'app/api/public/comunidad/comentarios/[id]/bloquear/route.ts',
  ]) {
    const f = leer(ruta);
    assert.match(f, /const user = await verificarUsuarioSupabase\(req\)/, ruta);
    assert.match(f, /const socioId = await socioAutenticado\(user\.userId, studioId\)/, ruta);
    assert.match(f, /socioId, authUserId: user\.userId, comentarioId: id/, ruta);
    assert.doesNotMatch(f, /body\??\.(socioId|autorId|socio_id)/, ruta);
  }
  const s = leer('lib/comunidad/comentarios-servidor.ts');
  // Antes de escribir: el comentario es de este estudio y su publicación va dirigida a ella.
  const visible = s.slice(s.indexOf('export async function comentarioVisible'), s.indexOf('/** Las socias con las que hay un bloqueo'));
  assert.match(visible, /\.eq\('id', p\.comentarioId\)\.eq\('studio_id', p\.studioId\)/);
  assert.match(visible, /socioEnLaAudiencia\(/);
  for (const fn of ['borrarComentarioPropio', 'denunciarComentario', 'bloquearAutoraDelComentario']) {
    const cuerpo = s.slice(s.indexOf(`export async function ${fn}`));
    assert.ok(cuerpo.indexOf('comentarioVisible(') > 0 && cuerpo.indexOf('comentarioVisible(') < 400, `${fn} empieza comprobando`);
  }
  // Borrar: solo lo suyo. Bloquear: solo a una alumna (al equipo se le denuncia).
  assert.match(s.slice(s.indexOf('export async function borrarComentarioPropio')), /if \(!c \|\| !esSuyo\(c, p\)\) return null;/);
  assert.match(s, /if \(!c\.socio_id\) return \{ ok: false, status: 400/);
});

test('el GET de comentarios filtra por bloqueos y por grupo, y el POST guarda el nombre corto', () => {
  const f = leer('app/api/public/comunidad/comentarios/route.ts');
  assert.match(f, /filtrarComentariosParaSocia\(/);
  assert.match(f, /bloqueadasConmigo\(admin, studioId, socioId\)/);
  assert.match(f, /filaComentarioDeSocia\(\{/);
  assert.doesNotMatch(f, /autor_nombre: nombreCompleto/, 'nunca el nombre completo');
});

test('el tablón de la alumna: fijadas primero, y en las de grupo el contador cuenta solo lo que ve', () => {
  const f = leer('app/api/public/comunidad/posts/route.ts');
  assert.match(f, /\.eq\('fijado', true\)/);
  assert.match(f, /\.or\('fijado\.is\.null,fijado\.eq\.false'\)/, 'una fijada no sale dos veces');
  assert.match(f, /const filas = \[\.\.\.fijadas, /, 'las fijadas, arriba');
  assert.match(f, /fijado: row\.fijado === true/);
  assert.match(f, /deGrupo\.includes\(row\.id\) \? \(comentariosVisibles\.get\(row\.id\) \?\? 0\)/);
});
